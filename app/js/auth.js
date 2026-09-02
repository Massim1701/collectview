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
 * Rendert die Konto-Zeile (Avatar, Benutzername, Abmelden) in einen Container.
 * Die E-Mail bleibt hier sichtbar (eigenes Konto) – anderen Nutzern zeigt die
 * App nirgends die E-Mail, nur den Benutzernamen aus profiles.display_name.
 */
const ACCENT_FARBEN = [
  { key: "rot", label: "Rot" },
  { key: "gelb", label: "Gelb" },
  { key: "gruen", label: "Grün" },
  { key: "blau", label: "Blau" },
  { key: "silber", label: "Silber" },
  { key: "gold", label: "Gold" },
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
    ${istPlus ? akzentfarbenMarkup(aktuelleFarbe) : ""}`;

  renderLangSwitcher(container.querySelector("#lang-switcher-slot"));
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
