/* login.js – Anmelden / Registrieren, danach zurück zur Zielseite */

const form = document.getElementById("login-form");
const errorEl = document.getElementById("auth-error");
const noteEl = document.getElementById("auth-note");

/** Nur relative Ziele zulassen – kein offener Redirect über ?next= */
function nextTarget() {
  const raw = new URLSearchParams(location.search).get("next") || "index.html";
  return /^[\w.-]+\.html(\?[\w=&%.-]*)?$/.test(raw) ? raw : "index.html";
}

// Wer schon angemeldet ist, muss sich nicht noch einmal anmelden.
sb.auth.getSession().then(({ data }) => {
  if (data.session) location.replace(nextTarget());
});

onAuth((user) => {
  if (user) location.replace(nextTarget());
});

function setBusy(busy, label) {
  form.querySelectorAll("button").forEach((b) => (b.disabled = busy));
  noteEl.innerHTML = busy ? `<span class="spinner"></span>${label}` : "";
}

function credentials() {
  return {
    email: document.getElementById("email").value.trim(),
    password: document.getElementById("password").value,
  };
}

function validate({ email, password }) {
  if (!email) return "Bitte gib deine E-Mail-Adresse ein.";
  if (password.length < 6) return "Das Passwort muss mindestens 6 Zeichen haben.";
  return null;
}

async function submit(mode) {
  errorEl.textContent = "";
  noteEl.textContent = "";

  const creds = credentials();
  const problem = validate(creds);
  if (problem) {
    errorEl.textContent = problem;
    document.getElementById(creds.email ? "password" : "email").focus();
    return;
  }

  setBusy(true, mode === "sign-up" ? "Konto wird angelegt …" : "Anmeldung läuft …");
  try {
    if (mode === "sign-up") {
      await signUp(creds.email, creds.password);
      setBusy(false);
      noteEl.textContent =
        "Konto angelegt. Falls eine Bestätigung nötig ist: E-Mail-Postfach prüfen und danach anmelden.";
    } else {
      await signIn(creds.email, creds.password);
      // Weiterleitung übernimmt onAuth – Buttons bleiben so lange gesperrt.
    }
  } catch (e) {
    setBusy(false);
    errorEl.textContent = e.message;
  }
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  submit("sign-in");
});

form.querySelector('[data-action="sign-up"]').addEventListener("click", () => submit("sign-up"));
