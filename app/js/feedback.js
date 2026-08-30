/* =====================================================================
   feedback.js – Rückmeldung aus der App heraus.
   Eigenständig wie marketplace.js: nutzt sb/escapeHtml aus den anderen
   Modulen, verändert sie aber nicht. Tabelle: siehe db/feedback.sql.
   ===================================================================== */

const FEEDBACK_CATEGORIES = [
  { key: "fehler", label: "Fehler" },
  { key: "wunsch", label: "Wunsch" },
  { key: "sonstiges", label: "Sonstiges" },
];

const FEEDBACK_MAX = 2000;

/** Postgres/PostgREST meldet eine fehlende Tabelle über diesen Code. */
const MISSING_TABLE = "PGRST205";

let feedbackDialog = null;

/**
 * Schreibt eine Rückmeldung. Wirft mit einer für Menschen lesbaren
 * Nachricht – der Aufrufer zeigt sie unverändert an.
 */
async function insertFeedback({ category, message, page }) {
  if (!currentUser) throw new Error("Nicht angemeldet.");

  const { error } = await sb.from("feedback").insert({
    user_id: currentUser.id,
    category,
    message,
    page,
    user_agent: navigator.userAgent.slice(0, 500),
  });

  if (!error) return;

  if (error.code === MISSING_TABLE || /Could not find the table/i.test(error.message || "")) {
    throw new Error(
      "Die Tabelle feedback fehlt noch in Supabase. Einmalig db/feedback.sql im SQL-Editor ausführen.",
    );
  }
  throw new Error(error.message);
}

/* ---------- Dialog ---------- */

function feedbackDialogMarkup() {
  const chips = FEEDBACK_CATEGORIES.map(
    (c, i) => `
      <button class="chip${i === 0 ? " active" : ""}" type="button"
              role="radio" aria-checked="${i === 0}" data-category="${c.key}">${escapeHtml(c.label)}</button>`,
  ).join("");

  return `
    <form method="dialog" id="feedback-form" class="feedback-form">
      <h2 class="feedback-title">Feedback geben</h2>
      <p class="feedback-lead">Was ist dir aufgefallen? Wir lesen jede Rückmeldung.</p>

      <div class="chip-row" id="feedback-categories" role="radiogroup" aria-label="Art der Rückmeldung">
        ${chips}
      </div>

      <label class="sr-only" for="feedback-message">Deine Rückmeldung</label>
      <textarea id="feedback-message" class="field feedback-textarea" rows="5"
                maxlength="${FEEDBACK_MAX}" placeholder="Beschreib kurz, worum es geht …"></textarea>
      <div class="feedback-counter" id="feedback-counter" aria-live="polite">0 / ${FEEDBACK_MAX}</div>

      <p class="err" id="feedback-error" role="alert"></p>

      <div class="row">
        <button class="btn-secondary" type="button" data-action="feedback-cancel">Abbrechen</button>
        <button class="btn-primary" type="button" data-action="feedback-send">Absenden</button>
      </div>
    </form>

    <div class="feedback-done" id="feedback-done" hidden>
      <div class="icon-badge"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 12.5l5 5 10-11"/></svg></div>
      <h2 class="feedback-title">Danke!</h2>
      <p class="feedback-lead">Deine Rückmeldung ist angekommen.</p>
      <button class="btn-primary" type="button" data-action="feedback-close">Schließen</button>
    </div>`;
}

/** Legt den Dialog einmalig an und hängt ihn an <body>. */
function ensureFeedbackDialog() {
  if (feedbackDialog) return feedbackDialog;

  feedbackDialog = document.createElement("dialog");
  feedbackDialog.className = "feedback-dialog";
  feedbackDialog.id = "feedback-dialog";
  feedbackDialog.innerHTML = feedbackDialogMarkup();
  document.body.appendChild(feedbackDialog);

  const message = feedbackDialog.querySelector("#feedback-message");
  const counter = feedbackDialog.querySelector("#feedback-counter");

  message.addEventListener("input", () => {
    counter.textContent = `${message.value.length} / ${FEEDBACK_MAX}`;
  });

  feedbackDialog.querySelector("#feedback-categories").addEventListener("click", (e) => {
    const chip = e.target.closest("[data-category]");
    if (!chip) return;
    feedbackDialog.querySelectorAll("[data-category]").forEach((c) => {
      const active = c === chip;
      c.classList.toggle("active", active);
      c.setAttribute("aria-checked", String(active));
    });
  });

  feedbackDialog.addEventListener("click", (e) => {
    const action = e.target.closest("[data-action]")?.dataset.action;
    if (action === "feedback-cancel" || action === "feedback-close") closeFeedback();
    if (action === "feedback-send") sendFeedback();
  });

  return feedbackDialog;
}

function selectedCategory() {
  return feedbackDialog.querySelector('[data-category].active')?.dataset.category
    || FEEDBACK_CATEGORIES[0].key;
}

function openFeedback() {
  const dialog = ensureFeedbackDialog();

  // Beim erneuten Öffnen mit leerem Formular starten.
  dialog.querySelector("#feedback-form").hidden = false;
  dialog.querySelector("#feedback-done").hidden = true;
  dialog.querySelector("#feedback-message").value = "";
  dialog.querySelector("#feedback-counter").textContent = `0 / ${FEEDBACK_MAX}`;
  dialog.querySelector("#feedback-error").textContent = "";
  dialog.querySelectorAll("[data-category]").forEach((c, i) => {
    c.classList.toggle("active", i === 0);
    c.setAttribute("aria-checked", String(i === 0));
  });

  dialog.showModal();
  dialog.querySelector("#feedback-message").focus();
}

function closeFeedback() {
  if (feedbackDialog?.open) feedbackDialog.close();
}

async function sendFeedback() {
  const dialog = feedbackDialog;
  const message = dialog.querySelector("#feedback-message");
  const errorEl = dialog.querySelector("#feedback-error");
  const sendBtn = dialog.querySelector('[data-action="feedback-send"]');

  const text = message.value.trim();
  errorEl.textContent = "";

  if (!text) {
    errorEl.textContent = "Bitte schreib kurz, worum es geht.";
    message.focus();
    return;
  }

  sendBtn.disabled = true;
  sendBtn.textContent = "Wird gesendet …";

  try {
    await insertFeedback({
      category: selectedCategory(),
      message: text,
      page: location.pathname.split("/").pop() || "index.html",
    });
    dialog.querySelector("#feedback-form").hidden = true;
    dialog.querySelector("#feedback-done").hidden = false;
    dialog.querySelector('[data-action="feedback-close"]').focus();
  } catch (e) {
    errorEl.textContent = e.message;
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = "Absenden";
  }
}

/** Verdrahtet jeden Button mit data-action="feedback-open" auf der Seite. */
function initFeedback(root = document) {
  root.querySelectorAll('[data-action="feedback-open"]').forEach((btn) => {
    btn.addEventListener("click", openFeedback);
  });
}
