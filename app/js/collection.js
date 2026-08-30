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
const sortEl = document.getElementById("sortierung");
const countEl = document.getElementById("result-count");

const params = new URLSearchParams(location.search);

let allItems = [];
const state = {
  format: formatFilterByKey(params.get("format")).key,
  query: "",
  sort: "newest",
};

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

function renderSort() {
  sortEl.innerHTML = Object.entries(SORTERS)
    .map(([key, s]) => `<option value="${key}"${key === state.sort ? " selected" : ""}>${escapeHtml(s.label)}</option>`)
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
      title: "Deine Sammlung ist noch leer",
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

  gridEl.innerHTML = items.map(coverTileMarkup).join("");
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
  gridEl.innerHTML = skeletonGrid(9);

  try {
    allItems = await fetchCollection();
    renderChips();
    renderGrid();
  } catch (e) {
    gridEl.innerHTML = "";
    messageEl.innerHTML = errorState(e.message);
  }

  if (params.get("focus") === "suche") searchEl.focus();
}

init();
