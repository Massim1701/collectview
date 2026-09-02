/* =====================================================================
   auth.js – Supabase-Client, Session-Handling, Seiten-Schutz
   Klassisches Script (kein Modul), damit es ohne Build-Schritt und auch
   per file:// läuft. Laden nach supabase-js und config.js.
   ===================================================================== */

// window.supabase ist die UMD-Bibliothek – der Client heißt bewusst anders.
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;

/** Callbacks, die bei jeder Session-Änderung laufen. */
const authListeners = [];

function onAuth(callback) {
  authListeners.push(callback);
  return callback;
}

sb.auth.onAuthStateChange((_event, session) => {
  currentUser = session?.user || null;
  authListeners.forEach((cb) => cb(currentUser));
});

/**
 * Schützt eine Seite: ohne Session zurück zum Login.
 * Gibt den User zurück, sobald die Session steht.
 */
/**
 * Setzt/entfernt die persoenliche Akzentfarbe auf <html data-accent="...">.
 * Ohne Farbe (color=null) bleibt/greift das feste Neongruen des
 * Tonstudio-Themes (siehe wireframes/styles.css). Rein visuell, kein
 * Sicherheitsmechanismus -- die Plus-Grenze erzwingt der DB-Trigger.
 */
function applyAccentColor(color) {
  if (color) {
    document.documentElement.dataset.accent = color;
  } else {
    delete document.documentElement.dataset.accent;
  }
}

async function requireAuth() {
  const { data } = await sb.auth.getSession();
  currentUser = data.session?.user || null;

  if (!currentUser) {
    const next = encodeURIComponent(location.pathname.split("/").pop() + location.search);
    location.replace(`login.html?next=${next}`);
    return null;
  }

  // Späteres Abmelden (auch in einem anderen Tab) führt ebenfalls zum Login.
  onAuth((user) => {
    if (!user) location.replace("login.html");
  });

  // Nicht blockierend: die Seite soll nicht auf die Akzentfarbe warten.
  fetchMyProfile(currentUser.id)
    .then((profile) => applyAccentColor(profile?.accent_color || null))
    .catch(() => {
      // Ohne Profil-Antwort bleibt die Standardfarbe stehen.
    });

  return currentUser;
}

async function signIn(email, password) {
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

async function signUp(email, password) {
  const { error } = await sb.auth.signUp({ email, password });
  if (error) throw error;
}

async function signOut() {
  await sb.auth.signOut();
}

/**
 * Verschickt eine "Passwort vergessen"-Mail. Antwortet nicht anders, wenn
 * die E-Mail unbekannt ist -- das übernimmt Supabase serverseitig, damit
 * niemand über die Fehlermeldung prüfen kann, welche Adressen ein Konto
 * haben. redirectTo bleibt relativ zur aktuellen Seite (login.html liegt
 * neben reset-password.html), damit es lokal wie live ohne Anpassung
 * stimmt.
 */
async function requestPasswordReset(email) {
  const redirectTo = `${location.origin}${location.pathname.replace(/[^/]*$/, "")}reset-password.html`;
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw error;
}

/* ---------- Konto-Dialog ----------
   Ersetzt die vormals fest eingebaute Konto-Karte (Sprache, Akzentfarbe,
   Benutzername) durch einen Dialog, den ein Icon-Button (z.B. der Avatar
   in der Topbar) öffnet. Ein <dialog> statt einem eigenen Popover, weil
   Escape/Fokus/Backdrop dann der Browser übernimmt -- selbes Muster wie
   der Feedback-Dialog in feedback.js. */

let accountDialog = null;

function ensureAccountDialog() {
  if (accountDialog) return accountDialog;

  accountDialog = document.createElement("dialog");
  accountDialog.className = "account-dialog";
  accountDialog.id = "account-dialog";
  accountDialog.innerHTML = `
    <div class="account-dialog-head">
      <div class="feedback-title" style="margin:0;">Konto</div>
      <button class="icon-close" type="button" data-action="account-close" aria-label="Schließen">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
    </div>
    <div id="account-dialog-body"></div>`;
  document.body.appendChild(accountDialog);

  accountDialog.querySelector('[data-action="account-close"]').addEventListener("click", () => accountDialog.close());

  return accountDialog;
}

/**
 * Verbindet einen Auslöser-Button mit dem Konto-Dialog. openNow öffnet ihn
 * sofort -- für den Sprung von der Bottom-Nav (index.html#konto), die von
 * jeder Seite aus auf dieselbe Anker-Adresse zeigt.
 */
function wireAccountMenu(buttonEl, user, { openNow = false } = {}) {
  if (!buttonEl || !user) return;

  const open = () => {
    const dialog = ensureAccountDialog();
    renderAccountRow(dialog.querySelector("#account-dialog-body"), user);
    dialog.showModal();
  };

  buttonEl.addEventListener("click", open);
  if (openNow) open();
}

/**
 * Rendert die Konto-Zeile (Avatar, Benutzername, Abmelden) in einen Container.
 * Die E-Mail bleibt hier sichtbar (eigenes Konto) – anderen Nutzern zeigt die
 * App nirgends die E-Mail, nur den Benutzernamen aus profiles.display_name.
 */
const ACCENT_FARBEN = [
  { key: "grau", label: "Grau" },
  { key: "gelb", label: "Gelb" },
  { key: "rot", label: "Rot" },
  { key: "gruen", label: "Grün" },
  { key: "orange", label: "Orange" },
];

/** Farbwahl-Zeile für Plus-Abonnenten: sechs Farbpunkte plus "Standard". */
function akzentfarbenMarkup(aktuelleFarbe) {
  const punkt = (key, label) => `
    <button class="accent-dot" type="button" data-accent-choice="${key}"
      aria-label="${escapeHtml(label)}" aria-pressed="${aktuelleFarbe === key}"
      style="--dot:var(--accent-dot-${key});${aktuelleFarbe === key ? "outline:2px solid var(--text);outline-offset:2px;" : ""}"></button>`;

  return `
    <div class="accent-picker" style="margin-top:14px;">
      <div class="user-label" style="margin-bottom:8px;">Akzentfarbe (CollectView Plus)</div>
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <button class="accent-dot" type="button" data-accent-choice=""
          aria-label="Standard (Neongrün)" aria-pressed="${!aktuelleFarbe}"
          style="background:#C8FF4D;${!aktuelleFarbe ? "outline:2px solid var(--text);outline-offset:2px;" : ""}"></button>
        ${ACCENT_FARBEN.map((f) => punkt(f.key, f.label)).join("")}
      </div>
    </div>`;
}

async function renderAccountRow(container, user) {
  if (!container || !user) return;

  let displayName = null;
  let isAdmin = false;
  let istPlus = false;
  let aktuelleFarbe = null;
  try {
    const profile = await fetchMyProfile(user.id);
    displayName = profile?.display_name || null;
    isAdmin = profile?.role === "admin";
    istPlus = profile?.subscription_status === "active";
    aktuelleFarbe = profile?.accent_color || null;
    applyAccentColor(aktuelleFarbe);
  } catch (e) {
    // Ohne Profil-Antwort bleibt nur die E-Mail als Anzeige.
  }

  container.innerHTML = `
    <div class="user-row">
      <div class="user-id">
        <div class="user-avatar" aria-hidden="true">${escapeHtml((displayName || user.email).charAt(0).toUpperCase())}</div>
        <div style="min-width:0;">
          <div class="user-email">${displayName ? escapeHtml(displayName) : "Noch kein Benutzername"}</div>
          <div class="user-label">${escapeHtml(user.email)}</div>
        </div>
      </div>
      <div class="user-actions">
        <span id="lang-switcher-slot"></span>
        ${isAdmin ? `<a class="btn-secondary small" href="admin.html">Admin</a>` : ""}
        <button class="btn-secondary small" type="button" data-action="edit-name">${displayName ? escapeHtml(t("account_change_username")) : escapeHtml(t("account_set_username"))}</button>
      </div>
    </div>
    ${istPlus ? akzentfarbenMarkup(aktuelleFarbe) : ""}
    <div style="margin-top:18px;padding-top:14px;border-top:1px solid var(--border);">
      <button class="menu-item danger" type="button" data-action="sign-out" style="border-bottom:none;padding:6px 2px;min-height:auto;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/></svg>
        ${escapeHtml(t("account_logout"))}
      </button>
    </div>`;

  renderLangSwitcher(container.querySelector("#lang-switcher-slot"));
  container.querySelector('[data-action="sign-out"]').addEventListener("click", () => signOut());

  container.querySelector('[data-action="edit-name"]').addEventListener("click", async () => {
    const input = prompt("Benutzername (3–20 Zeichen: Buchstaben, Ziffern, _ oder -)\nSichtbar für andere Nutzer, nie deine E-Mail:", displayName || "");
    if (input == null) return;
    const name = input.trim();
    if (!name) return;
    try {
      await setDisplayName(user.id, name);
      renderAccountRow(container, user);
    } catch (e) {
      alert(e.message);
    }
  });

  if (istPlus) {
    container.querySelectorAll("[data-accent-choice]").forEach((dot) => {
      dot.addEventListener("click", async () => {
        const farbe = dot.dataset.accentChoice || null;
        dot.disabled = true;
        try {
          await setAccentColor(user.id, farbe);
          applyAccentColor(farbe);
          renderAccountRow(container, user);
        } catch (e) {
          dot.disabled = false;
          alert(e.message);
        }
      });
    });
  }
}
