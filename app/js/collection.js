/* collection.js – Sammlung mit Suche, Format-Filter und Sortierung.
   Alle Einträge werden einmal geladen und danach im Browser gefiltert:
   bei Sammlungsgrößen im drei- bis vierstelligen Bereich ist das
   deutlich flotter als eine Abfrage pro Tastendruck. */

renderBottomNav(document.getElementById("bottomnav"), "collection");

const gridEl = document.getElementById("grid");
const messageEl = document.getElementById("grid-message");
const chipsEl = document.getElementById("chips");
const searchEl = document.getElementById("suche");
const clearEl = document.getElementById("search-clear");
const exportEl = document.getElementById("export-csv");
const sortEl = document.getElementById("sortierung");
const countEl = document.getElementById("result-count");

const params = new URLSearchParams(location.search);

let allItems = [];
const state = {
  format: formatFilterByKey(params.get("format")).key,
  query: "",
  sort: "title",
};

/** Erster Buchstabe für die Gruppierung: Ziffern zusammen unter "0–9". */
function groupLetter(value) {
  const c = String(value || "").trim().charAt(0).toLocaleUpperCase("de");
  if (/[0-9]/.test(c)) return "0–9";
  if (/[A-ZÄÖÜ]/.test(c)) return c;
  return "#";
}

/* ---------- Rendern ---------- */

function renderChips() {
  chipsEl.innerHTML = FORMAT_FILTERS.map((f) => {
    const count = f.key === "all" ? allItems.length : allItems.filter((i) => f.test(i.format || "")).length;
    // Formate ohne Treffer weglassen – "Alle" bleibt immer sichtbar.
    if (count === 0 && f.key !== "all" && f.key !== state.format) return "";
    return `
      <button class="chip${f.key === state.format ? " active" : ""}" type="button"
              data-format="${f.key}" aria-pressed="${f.key === state.format}">
        ${escapeHtml(f.label)}<span class="chip-count">${count}</span>
      </button>`;
  }).join("");
}

const SORT_I18N_KEYS = { title: "collection_sort_title", artist: "collection_sort_artist" };

function renderSort() {
  sortEl.innerHTML = Object.entries(SORTERS)
    .map(([key, s]) => `<option value="${key}"${key === state.sort ? " selected" : ""}>${escapeHtml(SORT_I18N_KEYS[key] ? t(SORT_I18N_KEYS[key]) : s.label)}</option>`)
    .join("");
}

function visibleItems() {
  const byFormat = allItems.filter((item) => matchesFormat(item, state.format));
  return sortItems(searchItems(byFormat, state.query), state.sort);
}

function renderGrid() {
  const items = visibleItems();
  messageEl.innerHTML = "";

  if (allItems.length === 0) {
    gridEl.innerHTML = "";
    countEl.textContent = "";
    messageEl.innerHTML = emptyState({
      iconName: "scan",
      title: t("collection_empty"),
      text: "Scanne den Barcode deiner ersten Platte oder CD – Titel, Interpret und Cover kommen automatisch von Discogs.",
      action: { href: "scanner.html", label: "Jetzt scannen" },
    });
    return;
  }

  countEl.textContent =
    items.length === allItems.length
      ? `${allItems.length} ${allItems.length === 1 ? "Eintrag" : "Einträge"}`
      : `${items.length} von ${allItems.length}`;

  if (items.length === 0) {
    gridEl.innerHTML = "";
    messageEl.innerHTML = emptyState({
      iconName: "search",
      title: "Keine Treffer",
      text: state.query
        ? `Für „${state.query}“ ist in diesem Filter nichts dabei.`
        : "In diesem Format ist noch nichts gespeichert.",
    });
    return;
  }

  // Nur bei Titel/Interpret-Sortierung gruppieren – sonst (neueste, Jahr) reine Liste.
  const groupBy = state.sort === "title" ? (i) => groupLetter(i.title)
    : state.sort === "artist" ? (i) => groupLetter(i.artist)
    : null;

  if (!groupBy) {
    gridEl.innerHTML = items.map(plainListRowMarkup).join("");
    return;
  }

  let html = "";
  let current = null;
  for (const item of items) {
    const letter = groupBy(item);
    if (letter !== current) {
      html += `<div class="alpha-heading">${escapeHtml(letter)}</div>`;
      current = letter;
    }
    html += plainListRowMarkup(item);
  }
  gridEl.innerHTML = html;
}

/* ---------- CSV-Export ----------
   Exportiert die aktuell sichtbare (gefilterte/sortierte) Auswahl, nicht
   zwingend die ganze Sammlung -- wer nach "Vinyl" filtert und exportiert,
   erwartet eine CSV nur mit Vinyl. Semikolon als Trenner und ein BOM am
   Anfang, weil Excel (v.a. auf Deutsch) Komma-getrennte UTF-8-Dateien ohne
   BOM gern als eine einzige Spalte voller Sonderzeichen anzeigt. */

const CSV_COLUMNS = [
  { key: "title", label: "Titel" },
  { key: "artist", label: "Interpret" },
  { key: "format", label: "Format" },
  { key: "year", label: "Jahr" },
  { key: "country", label: "Land" },
  { key: "barcode", label: "Barcode" },
  { key: "quantity", label: "Anzahl" },
  { key: "notes", label: "Notizen" },
  { key: "created_at", label: "Hinzugefügt am" },
];

function csvField(value) {
  const s = value === null || value === undefined ? "" : String(value);
  const needsQuoting = s.indexOf(";") !== -1 || s.indexOf('"') !== -1 || s.indexOf("\n") !== -1 || s.indexOf("\r") !== -1;
  return needsQuoting ? '"' + s.split('"').join('""') + '"' : s;
}

function formatDateForCsv(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("de");
}

function buildCsv(items) {
  const NEWLINE = "\r\n";
  const header = CSV_COLUMNS.map((c) => csvField(c.label)).join(";");
  const rows = items.map((item) =>
    CSV_COLUMNS.map((c) => csvField(c.key === "created_at" ? formatDateForCsv(item[c.key]) : item[c.key])).join(";"),
  );
  return [header].concat(rows).join(NEWLINE);
}

function downloadCsv() {
  const items = visibleItems();
  if (items.length === 0) return;

  const BOM = "﻿";
  const csv = BOM + buildCsv(items);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  const datum = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = "collectview-sammlung-" + datum + ".csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/* ---------- Ereignisse ---------- */

chipsEl.addEventListener("click", (e) => {
  const chip = e.target.closest("[data-format]");
  if (!chip) return;
  state.format = chip.dataset.format;
  renderChips();
  renderGrid();
});

let searchTimer;
searchEl.addEventListener("input", () => {
  clearEl.hidden = searchEl.value === "";
  clearTimeout(searchTimer);
  // Kurze Verzögerung: nicht bei jedem Tastenanschlag neu rendern.
  searchTimer = setTimeout(() => {
    state.query = searchEl.value;
    renderGrid();
  }, 140);
});

exportEl.addEventListener("click", downloadCsv);

clearEl.addEventListener("click", () => {
  searchEl.value = "";
  clearEl.hidden = true;
  state.query = "";
  renderGrid();
  searchEl.focus();
});

sortEl.addEventListener("change", () => {
  state.sort = sortEl.value;
  renderGrid();
});

/* ---------- Start ---------- */

async function init() {
  const user = await requireAuth();
  if (!user) return;

  renderSort();
  gridEl.innerHTML = skeletonList(9);

  try {
    allItems = await fetchCollection();
    saveOfflineCollection(user.id, allItems);
    renderChips();
    renderGrid();
    showFreeLimitHint(user, allItems.length);
  } catch (e) {
    // Kein Netz? Dann den letzten gespeicherten Stand zeigen, statt nur
    // eine Fehlermeldung -- dafuer gibt es den Offline-Cache.
    const cached = loadOfflineCollection(user.id);
    if (cached) {
      allItems = cached.items;
      renderChips();
      renderGrid();
      showOfflineNotice(cached.savedAt);
    } else {
      gridEl.innerHTML = "";
      messageEl.innerHTML = errorState(e.message);
    }
  }

  if (params.get("focus") === "suche") searchEl.focus();
}

/** Banner ueber der Sammlung: "Offline -- Stand vom ...". */
function showOfflineNotice(savedAt) {
  const el = document.createElement("div");
  el.className = "muted";
  el.style.cssText = "font-size:12.5px; margin:0 0 10px; padding:8px 12px; background:var(--surface-2); border-radius:var(--radius-sm);";
  el.textContent = `Offline – zeigt den zuletzt gespeicherten Stand vom ${offlineStandText(savedAt)}.`;
  gridEl.insertAdjacentElement("beforebegin", el);
}

/** Hinweis auf das Free-Limit (max. 5), solange kein Abo aktiv ist. */
async function showFreeLimitHint(user, count) {
  try {
    if (await fetchIsSubscribed(user.id)) return;
  } catch (e) {
    return;
  }
  const hint = document.createElement("div");
  hint.className = "muted";
  hint.style.cssText = "font-size:12.5px; margin-top:2px;";
  hint.innerHTML = count >= 5
    ? `Free-Limit erreicht (5/5). <a href="../wireframes/pricing.html" style="color:var(--accent-text); font-weight:700;">CollectView Plus</a> für mehr.`
    : `${count}/5 in der kostenlosen Version.`;
  countEl.insertAdjacentElement("afterend", hint);
}

initSaleText(gridEl, (id) => allItems.find((it) => it.id === id));

init();
