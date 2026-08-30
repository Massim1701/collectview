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
 * Rendert die Konto-Zeile (Avatar, E-Mail, Abmelden) in einen Container.
 */
function renderAccountRow(container, user) {
  if (!container || !user) return;
  container.innerHTML = `
    <div class="user-row">
      <div class="user-id">
        <div class="user-avatar" aria-hidden="true">${escapeHtml(user.email.charAt(0).toUpperCase())}</div>
        <div style="min-width:0;">
          <div class="user-email">${escapeHtml(user.email)}</div>
          <div class="user-label">Angemeldet</div>
        </div>
      </div>
      <button class="btn-secondary small" type="button" data-action="sign-out">Abmelden</button>
    </div>`;
  container.querySelector('[data-action="sign-out"]').addEventListener("click", signOut);
}
