/* =====================================================================
   ui.js – geteilte Render-Bausteine im CollectView-Design
   Alle Klassen stammen aus wireframes/styles.css bzw. app/app.css.
   ===================================================================== */

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]),
  );
}

/** Deterministischer Farbverlauf-Platzhalter (cover-1 … cover-6) für Cover ohne Bild. */
function coverClass(seed) {
  const s = String(seed || "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return "cover-" + ((h % 6) + 1);
}

/**
 * Cover-Kachel. Das echte Bild liegt über dem Verlauf und wird erst
 * eingeblendet, wenn es geladen ist – schlägt es fehl, bleibt der
 * Verlauf stehen. Feste Box durch aspect-ratio: kein Layout-Shift.
 */
function coverMarkup(item, { size = null, lazy = true } = {}) {
  const style = size ? ` style="width:${size}px;height:${size}px;flex:0 0 ${size}px;"` : "";
  // lazy=false für Bilder, die sofort sichtbar sind. Warum das nötig ist:
  // Das Bild startet mit opacity:0 und wird erst durch die Klasse "loaded"
  // sichtbar. Wird das Markup neu gesetzt, während es im Blick steht – auf
  // der Detailseite passiert genau das, render() läuft vor und nach dem
  // Discogs-Abruf –, stellt der Browser das Laden zurück und holt es nicht
  // mehr nach. Das Bild bleibt dann dauerhaft unsichtbar, ohne Fehler und
  // ohne Platzhalter, also ohne jeden Hinweis. Am 02.09.2026 im Browser
  // nachgestellt: mit lazy bleibt complete=false, ohne lazy lädt es.
  const laden = lazy ? ' loading="lazy"' : "";
  const img = item.cover_url
    ? `<img src="${escapeHtml(item.cover_url)}" alt=""${laden} decoding="async"
            onload="this.classList.add('loaded')" onerror="this.remove()">`
    : "";
  return `<div class="cover ${coverClass(item.discogs_id || item.title)}"${style}>${img}</div>`;
}

/** "The Beatles · Vinyl, LP · 1969" – leere Felder fallen weg. */
function itemSubtitle(item) {
  return [item.artist, item.format, item.year].filter(Boolean).map(escapeHtml).join(" · ");
}

/** Link zur Detailseite eines gespeicherten Eintrags. */
function detailHref(item) {
  return `detail.html?id=${encodeURIComponent(item.id)}`;
}

/** Listeneintrag im .list-card-Stil, führt zur Detailseite. */
function listCardMarkup(item) {
  return `
    <a class="list-card" href="${detailHref(item)}">
      ${coverMarkup(item, { size: 56 })}
      <div style="min-width:0;">
        <div class="list-card-title">${escapeHtml(item.title)}</div>
        <div class="list-card-sub">${itemSubtitle(item)}</div>
      </div>
      <svg class="chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
    </a>`;
}

/**
 * "×3", wenn ein Tonträger mehrfach im Regal steht. Bei einem einzelnen
 * Exemplar (dem Normalfall) bleibt der Platz leer – die Liste soll nicht
 * bei jedem Eintrag eine 1 tragen.
 */
function qtyBadgeMarkup(item) {
  const n = Number(item.quantity);
  if (!Number.isFinite(n) || n <= 1) return "";
  return `<span class="qty-badge" aria-label="${n} Exemplare">×${escapeHtml(n)}</span>`;
}

/**
 * Listeneintrag mit Cover-Miniatur (44px, etwas kleiner als listCardMarkup) für die
 * Sammlungsübersicht. Bild-Tag trägt loading="lazy": bei einer langen
 * Liste laedt der Browser nur die Cover, die tatsaechlich in den
 * sichtbaren Bereich gescrollt werden, nicht alle auf einmal.
 */
function saleIconButtonMarkup(item) {
  return `
    <button class="sale-icon-btn" type="button" data-action="sale-open" data-id="${escapeHtml(item.id)}"
            aria-label="Verkaufstext für „${escapeHtml(item.title)}“ erstellen" title="Verkaufstext erstellen">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
    </button>`;
}

function plainListRowMarkup(item) {
  return `
    <a class="list-card" href="${detailHref(item)}">
      ${coverMarkup(item, { size: 44 })}
      <div style="min-width:0;">
        <div class="list-card-title">${escapeHtml(item.title)}</div>
        <div class="list-card-sub">${itemSubtitle(item)}</div>
      </div>
      ${qtyBadgeMarkup(item)}
      ${saleIconButtonMarkup(item)}
      <svg class="chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
    </a>`;
}

/** Kachel für Rail und Grid, führt zur Detailseite. */
function coverTileMarkup(item) {
  return `
    <a href="${detailHref(item)}" data-id="${escapeHtml(item.id)}">
      ${coverMarkup(item)}
      <div class="cover-title">${escapeHtml(item.title)}</div>
      <div class="cover-artist">${escapeHtml(item.artist || "Unbekannt")}</div>
    </a>`;
}

/** Ladeplatzhalter im Grid – hält die Höhe, damit nichts springt. */
function skeletonGrid(count = 6) {
  return Array.from({ length: count })
    .map(
      () => `
      <div aria-hidden="true">
        <div class="skeleton" style="aspect-ratio:1;border-radius:14px;"></div>
        <div class="skeleton skeleton-line"></div>
        <div class="skeleton skeleton-line short"></div>
      </div>`,
    )
    .join("");
}

/** Ladeplatzhalter für reine Textlisten (z. B. Sammlung ohne Cover). */
function skeletonList(count = 8) {
  return Array.from({ length: count })
    .map(() => `<div class="skeleton skeleton-line" style="height:50px;border-radius:var(--radius-md);"></div>`)
    .join("");
}

const ICONS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  scan: '<rect x="7" y="8" width="10" height="8" rx="1"/><path d="M4 8V6a2 2 0 0 1 2-2h2M20 8V6a2 2 0 0 0-2-2h-2M4 16v2a2 2 0 0 0 2 2h2M20 16v2a2 2 0 0 1-2 2h-2"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.01"/>',
};

function icon(name, size = 26) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ""}</svg>`;
}

/** Leerzustand mit optionalem Call-to-Action. */
function emptyState({ iconName = "grid", title, text, action }) {
  return `
    <div class="empty-state">
      ${icon(iconName)}
      ${title ? `<div class="empty-title">${escapeHtml(title)}</div>` : ""}
      <div>${escapeHtml(text)}</div>
      ${action ? `<a class="btn-primary" href="${escapeHtml(action.href)}" style="display:inline-flex;align-items:center;">${escapeHtml(action.label)}</a>` : ""}
    </div>`;
}

function errorState(message) {
  return `
    <div class="empty-state">
      ${icon("alert")}
      <div class="empty-title">${escapeHtml(t("common_error_title"))}</div>
      <div>${escapeHtml(message)}</div>
    </div>`;
}

/**
 * Bottom-Nav. `active` ist eine der Seiten: home | collection | search | account.
 * Wird per JS gerendert, damit die Navigation an einer Stelle gepflegt wird.
 */
function renderBottomNav(container, active) {
  const item = (key, href, label, path) => {
    const isActive = key === active;
    const tag = isActive ? "span" : "a";
    return `
      <${tag} class="navitem${isActive ? " active" : ""}"${isActive ? ' aria-current="page"' : ` href="${href}"`}>
        <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke-width="1.8"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>
        ${label}
      </${tag}>`;
  };

  container.innerHTML = `
    <nav class="bottomnav-inner" aria-label="Hauptnavigation">
      ${item("home", "index.html", t("nav_home"), '<path d="M3 11l9-7 9 7"/><path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9"/>')}
      ${item("collection", "collection.html", t("nav_collection"), ICONS.grid)}
      <a class="fab" href="scanner.html">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="7" y="8" width="10" height="8" rx="1"/><path d="M4 8V6a2 2 0 0 1 2-2h2M20 8V6a2 2 0 0 0-2-2h-2"/>
        </svg>
        <span class="sr-only">${escapeHtml(t("nav_scan_sr"))}</span>
      </a>
      ${item("forum", "marketplace.html", t("nav_forum"), '<path d="M3 9l1.5-5h15L21 9"/><path d="M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9"/><path d="M9 21v-6h6v6"/>')}
      ${item("search", "collection.html?focus=suche", t("nav_search"), ICONS.search)}
      ${item("account", "index.html#konto", t("nav_account"), '<circle cx="12" cy="8" r="4"/><path d="M4 20c1.8-4 5-6 8-6s6.2 2 8 6"/>')}
    </nav>`;
}
