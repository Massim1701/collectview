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

  // Ebenfalls nicht blockierend -- Grundlage für die Online-Liste
  // (staff_presence, nur Admin/Mod). Ein Fehlschlag hier darf nie eine
  // Seite lahmlegen.
  touchLastSeen(currentUser.id).catch(() => {});

  return currentUser;
}

/**
 * Erzwingt einen Benutzernamen, bevor eine Nachricht geschrieben werden
 * kann -- Wunsch von Massimo (03.09.2026): angemeldete Nutzer sollen sich
 * im Chat nie als "Unbekannter Nutzer" oder gar über ihre E-Mail zeigen
 * (die App zeigt anderen Nutzern ohnehin nirgends die E-Mail, siehe
 * renderAccountRow oben -- das hier schließt die letzte Lücke: ganz ohne
 * Namen). Gibt den gesetzten Namen zurück, oder null, wenn abgebrochen
 * wurde -- Aufrufer soll dann selbst nichts senden.
 */
async function requireDisplayName(user) {
  let profile;
  try {
    profile = await fetchMyProfile(user.id);
  } catch (e) {
    alert(e.message);
    return null;
  }
  if (profile?.display_name) return profile.display_name;

  const input = prompt(
    "Bevor du Nachrichten schreiben kannst, brauchst du einen Benutzernamen " +
    "(3–20 Zeichen: Buchstaben, Ziffern, _ oder -).\nSichtbar für andere Nutzer, nie deine E-Mail:",
    "",
  );
  if (input == null) return null;
  const name = input.trim();
  if (!name) return null;

  try {
    await setDisplayName(user.id, name);
    return name;
  } catch (e) {
    alert(e.message);
    return null;
  }
}

/**
 * Wie requireAuth(), nur ohne Zwang: fehlt eine Sitzung, wird eine
 * anonyme angelegt statt zum Login zu schicken -- für den Nutzer
 * unsichtbar (kein Formular, kein Redirect), backend-seitig aber eine
 * echte Supabase-Sitzung mit eigenem Token. Discogs-Proxy und
 * Preisabfrage (discogs-suche/discogs-preis) laufen damit unverändert:
 * beide prüfen nur, ob überhaupt eine Sitzung besteht.
 *
 * Speichern in die Sammlung bleibt trotzdem gesperrt -- das erzwingt
 * die RLS-Regel (auth.uid() = user_id and is_subscribed(...), siehe
 * db/free-tier-gate.sql), eine anonyme Sitzung hat nie ein Abo.
 *
 * Nur für Seiten gedacht, die auch ohne Konto nutzbar sein sollen
 * (aktuell: scanner.html). Alles, was echte Nutzerdaten zeigt
 * (Sammlung, Detailseite, Konto), bleibt bei requireAuth().
 */
async function ensureSession() {
  const { data } = await sb.auth.getSession();
  if (data.session?.user) {
    currentUser = data.session.user;
    return currentUser;
  }

  const { data: anon, error } = await sb.auth.signInAnonymously();
  if (error) {
    // Kein Absturz: der Scanner soll auch dann noch nutzbar sein, nur
    // eben ohne Discogs-Proxy/Preis (deren Direktweg-Fallback greift).
    console.error("Anonyme Sitzung fehlgeschlagen:", error.message);
    return null;
  }
  currentUser = anon.user;
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
          style="background:#A3C9A3;${!aktuelleFarbe ? "outline:2px solid var(--text);outline-offset:2px;" : ""}"></button>
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
