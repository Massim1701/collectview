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
async function renderAccountRow(container, user) {
  if (!container || !user) return;

  let displayName = null;
  try {
    displayName = (await fetchMyProfile(user.id))?.display_name || null;
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
      <div style="display:flex; gap:8px; flex:0 0 auto; align-items:center;">
        <span id="lang-switcher-slot"></span>
        <button class="btn-secondary small" type="button" data-action="edit-name">${displayName ? escapeHtml(t("account_change_username")) : escapeHtml(t("account_set_username"))}</button>
        <button class="btn-secondary small" type="button" data-action="sign-out">${escapeHtml(t("account_logout"))}</button>
      </div>
    </div>`;

  renderLangSwitcher(container.querySelector("#lang-switcher-slot"));
  container.querySelector('[data-action="sign-out"]').addEventListener("click", signOut);
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
}
