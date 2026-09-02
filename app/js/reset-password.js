const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const form = document.getElementById("reset-form");
const errorEl = document.getElementById("reset-error");
const noteEl = document.getElementById("reset-note");

let recoveryReady = false;

sb.auth.onAuthStateChange((event) => {
  if (event === "PASSWORD_RECOVERY") recoveryReady = true;
});

sb.auth.getSession().then(({ data }) => {
  if (data.session) recoveryReady = true;
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorEl.textContent = "";
  noteEl.textContent = "";

  const password = document.getElementById("password").value;
  const password2 = document.getElementById("password2").value;

  if (password.length < 6) {
    errorEl.textContent = "Das Passwort muss mindestens 6 Zeichen haben.";
    return;
  }
  if (password !== password2) {
    errorEl.textContent = "Die beiden Passwörter stimmen nicht überein.";
    return;
  }
  if (!recoveryReady) {
    errorEl.textContent =
      "Dieser Link ist abgelaufen oder wurde schon benutzt. Bitte auf der Anmeldeseite erneut „Passwort vergessen“ anfordern.";
    return;
  }

  form.querySelectorAll("button").forEach((b) => (b.disabled = true));
  noteEl.innerHTML = '<span class="spinner"></span>Wird gespeichert …';

  const { error } = await sb.auth.updateUser({ password });

  if (error) {
    form.querySelectorAll("button").forEach((b) => (b.disabled = false));
    noteEl.textContent = "";
    errorEl.textContent = error.message;
    return;
  }

  noteEl.textContent = "Passwort geändert. Du wirst weitergeleitet …";
  setTimeout(() => location.replace("index.html"), 1200);
});
