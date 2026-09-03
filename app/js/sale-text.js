/* =====================================================================
   sale-text.js – Verkaufstext-Generator: fertigen Text zum Kopieren, wenn
   ein Tonträger auf einer anderen Plattform (eBay, Kleinanzeigen, Discogs
   Marketplace, …) verkauft werden soll. Übernimmt alles, was am Eintrag
   schon gespeichert ist – nur den Zustand von Tonträger und Cover trägt
   der Nutzer selbst ein, das kann niemand automatisch wissen.
   Unabhängiges Modul wie feedback.js: nutzt escapeHtml aus ui.js, ändert
   es aber nicht.
   ===================================================================== */

const SALE_CONDITIONS = [
  { key: "m", label: "Mint (M)" },
  { key: "nm", label: "Near Mint (NM)" },
  { key: "vgplus", label: "Very Good Plus (VG+)" },
  { key: "vg", label: "Very Good (VG)" },
  { key: "gplus", label: "Good Plus (G+)" },
  { key: "g", label: "Good (G)" },
  { key: "f", label: "Fair (F)" },
  { key: "p", label: "Poor (P)" },
];

let saleDialog = null;
let saleItem = null;

/**
 * Gesetzt, wenn der Dialog aus dem Marktplatz-Formular (listing-new.html)
 * geöffnet wurde: dann übernimmt der Haupt-Button den Text direkt ins
 * Beschreibungsfeld statt ihn in die Zwischenablage zu kopieren – Kopieren/
 * Einfügen entfällt. Auf den übrigen Seiten (Sammlung) bleibt null, dort
 * kopiert der Button wie bisher.
 */
let saleInsertCallback = null;

/* ---------- Text-Bausteine ---------- */

function saleConditionLabel(key) {
  return SALE_CONDITIONS.find((c) => c.key === key)?.label || "";
}

/** Discogs verlinkt Releases über die numerische ID, nicht über den Barcode. */
function saleDiscogsUrl(item) {
  return item.discogs_id ? `https://www.discogs.com/release/${encodeURIComponent(item.discogs_id)}` : null;
}

/** Baut den fertigen Verkaufstext aus dem Eintrag + den zwei Zuständen. */
function buildSaleText(item, mediumKey, coverKey) {
  const lines = [];

  lines.push([item.artist, item.title].filter(Boolean).join(" – ") || item.title);
  lines.push([item.format, item.year, item.country].filter(Boolean).join(" · "));
  if (item.barcode) lines.push(`Barcode: ${item.barcode}`);
  const discogsUrl = saleDiscogsUrl(item);
  if (discogsUrl) lines.push(`Discogs: ${discogsUrl}`);

  lines.push("");
  lines.push(`Zustand Tonträger: ${mediumKey ? saleConditionLabel(mediumKey) : "–"}`);
  lines.push(`Zustand Cover: ${coverKey ? saleConditionLabel(coverKey) : "–"}`);

  return lines.join("\n");
}

/* ---------- Dialog ---------- */

function saleConditionOptions() {
  return `<option value="">– bitte wählen –</option>` +
    SALE_CONDITIONS.map((c) => `<option value="${c.key}">${escapeHtml(c.label)}</option>`).join("");
}

function saleDialogMarkup() {
  return `
    <h2 class="feedback-title">Verkaufstext erstellen</h2>
    <p class="feedback-lead">Zustand eintragen, dann kopieren – fertig zum Einfügen bei eBay, Kleinanzeigen &amp; Co.</p>

    <div class="sale-label">Zustand Tonträger</div>
    <select id="sale-cond-medium" class="field">${saleConditionOptions()}</select>

    <div class="sale-label" style="margin-top:12px;">Zustand Cover</div>
    <select id="sale-cond-cover" class="field">${saleConditionOptions()}</select>

    <div class="sale-label" style="margin-top:14px;">Verkaufstext</div>
    <textarea id="sale-output" class="field feedback-textarea" rows="9" readonly></textarea>

    <p class="err" id="sale-copied" role="status" aria-live="polite"></p>

    <div class="row">
      <button class="btn-secondary" type="button" data-action="sale-close">Schließen</button>
      <button class="btn-primary" type="button" data-action="sale-copy" id="sale-copy-btn">Text kopieren</button>
    </div>`;
}

/** Beschriftung/Vorschau je nachdem, ob der Text kopiert oder direkt
    übernommen wird (siehe saleInsertCallback). */
function applySaleDialogMode() {
  const lead = saleDialog.querySelector(".feedback-lead");
  const btn = saleDialog.querySelector("#sale-copy-btn");
  if (saleInsertCallback) {
    lead.textContent = "Zustand eintragen – der Text landet direkt in der Beschreibung.";
    btn.textContent = "Übernehmen";
  } else {
    lead.textContent = "Zustand eintragen, dann kopieren – fertig zum Einfügen bei eBay, Kleinanzeigen & Co.";
    btn.textContent = "Text kopieren";
  }
}

function refreshSaleText() {
  if (!saleDialog || !saleItem) return;
  const medium = saleDialog.querySelector("#sale-cond-medium").value;
  const cover = saleDialog.querySelector("#sale-cond-cover").value;
  saleDialog.querySelector("#sale-output").value = buildSaleText(saleItem, medium, cover);
  saleDialog.querySelector("#sale-copied").textContent = "";
}

function ensureSaleDialog() {
  if (saleDialog) return saleDialog;

  saleDialog = document.createElement("dialog");
  saleDialog.className = "feedback-dialog sale-dialog";
  saleDialog.id = "sale-dialog";
  saleDialog.innerHTML = saleDialogMarkup();
  document.body.appendChild(saleDialog);

  saleDialog.querySelector("#sale-cond-medium").addEventListener("change", refreshSaleText);
  saleDialog.querySelector("#sale-cond-cover").addEventListener("change", refreshSaleText);

  saleDialog.addEventListener("click", (e) => {
    const action = e.target.closest("[data-action]")?.dataset.action;
    if (action === "sale-close") closeSaleText();
    if (action === "sale-copy") {
      if (saleInsertCallback) {
        saleInsertCallback(saleDialog.querySelector("#sale-output").value);
        closeSaleText();
      } else {
        copySaleText();
      }
    }
  });

  return saleDialog;
}

/**
 * Öffnet den Dialog für einen Eintrag. Formular startet jedes Mal leer.
 * `onInsert(text)` optional: statt in die Zwischenablage zu kopieren,
 * übernimmt der Haupt-Button den Text direkt dorthin (Marktplatz-Formular).
 */
function openSaleText(item, { onInsert } = {}) {
  if (!item) return;
  saleItem = item;
  saleInsertCallback = onInsert || null;
  const dialog = ensureSaleDialog();
  dialog.querySelector("#sale-cond-medium").value = "";
  dialog.querySelector("#sale-cond-cover").value = "";
  dialog.querySelector("#sale-copied").textContent = "";
  applySaleDialogMode();
  refreshSaleText();
  dialog.showModal();
}

function closeSaleText() {
  if (saleDialog?.open) saleDialog.close();
}

/**
 * In die Zwischenablage kopieren. navigator.clipboard braucht einen
 * sicheren Kontext (https) und Nutzer-Interaktion – beides ist hier
 * gegeben. execCommand("copy") bleibt als Rückfallebene für Browser
 * ohne Clipboard-API.
 */
async function copySaleText() {
  const output = saleDialog.querySelector("#sale-output");
  const notice = saleDialog.querySelector("#sale-copied");

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(output.value);
    } else {
      output.focus();
      output.select();
      document.execCommand("copy");
    }
    notice.textContent = "In die Zwischenablage kopiert.";
  } catch {
    output.focus();
    output.select();
    notice.textContent = "Kopieren hat nicht geklappt – Text ist markiert, selbst kopieren (Strg/Cmd+C).";
  }
}

/**
 * Verdrahtet jeden Button mit data-action="sale-open" auf der Seite.
 * `lookup(id)` liefert zum jeweiligen data-id das Item-Objekt – auf der
 * Detailseite reicht das schon geladene currentItem, in der Sammlungsliste
 * die Zuordnung über allItems.
 */
function initSaleText(root, lookup) {
  root.addEventListener("click", (e) => {
    const btn = e.target.closest('[data-action="sale-open"]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const item = lookup(btn.dataset.id);
    if (item) openSaleText(item);
  });
}
