/* =====================================================================
   detail.js – Detailseite eines Sammlungseintrags: detail.html?id=<uuid>
   Stammdaten kommen aus Supabase, Tracklist/Label/Videos werden bei
   Discogs nachgeladen (Release-Endpoint, nicht die Barcode-Suche).
   ===================================================================== */

renderBottomNav(document.getElementById("bottomnav"), "collection");

const shell = document.getElementById("detail");
const itemId = new URLSearchParams(location.search).get("id");

/* ---------- Discogs ---------- */

/** Vollständiges Release inkl. Tracklist. null, wenn es nicht klappt –
    die Seite funktioniert auch ohne, nur mit weniger Inhalt. */
async function fetchRelease(discogsId) {
  if (!discogsId) return null;
  try {
    const res = await fetch(`https://api.discogs.com/releases/${encodeURIComponent(discogsId)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/* ---------- Bausteine ---------- */

function heroMarkup(item) {
  return `
    <div class="detail-hero">
      <a class="detail-back" href="collection.html" aria-label="Zurück zur Sammlung">
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
      </a>
      <!-- Kein lazy: das Cover ist hier das Erste, was man sehen soll. -->
      ${coverMarkup(item, { lazy: false })}
    </div>`;
}

/** "1991 · Vinyl, LP · DGC Records" – leere Angaben fallen weg. */
function metaLine(item, release) {
  const label = release?.labels?.[0]?.name;
  return [item.year, item.format, label].filter(Boolean).map(escapeHtml).join(" · ");
}

/**
 * Pro-Track-Hörlinks. YouTube-Videos liefert Discogs nicht pro Titel,
 * deshalb wie bei der alten Album-weiten Suche: vorbereitete Suchlinks
 * statt Links, die ins Leere zeigen könnten.
 */
/** Hörlink-Anbieter, alphabetisch sortiert – so erscheinen sie auch im
    Markup (nicht nach Beliebtheit oder Einbaudatum). */
function trackLinkProviders(query) {
  const q = encodeURIComponent(query);
  return [
    {
      key: "am",
      label: "Apple Music",
      href: `https://music.apple.com/search?term=${q}`,
      svg: `<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="6" fill="#FA233B"/><path fill="#fff" d="M11.9 9.1c-.2-2 1.1-3.9 3.1-4-.1 1.9-1.7 3.9-3.1 4Z"/><path fill="#fff" d="M12 10.3c1.1-.7 2.6-1 4-.3 1.1.6 1.9 1.6 2.3 2.8-1.7.7-2.1 3.1-.6 4.3-.5 1.1-1.1 2.1-1.9 3-.7.8-1.5 1.6-2.6 1.6-1 0-1.4-.6-2.5-.6s-1.5.6-2.5.6c-1.1 0-2-1-2.7-1.8-1.9-2.3-2.2-6.1-.4-8.1 1.1-1.3 2.9-1.5 4-.7.8.5 1.4.5 2.9-.8Z"/><circle cx="17.4" cy="14.6" r="1.55" fill="#FA233B"/></svg>`,
    },
    {
      key: "dz",
      label: "Deezer",
      href: `https://www.deezer.com/search/${q}`,
      svg: `<svg width="20" height="14" viewBox="0 0 24 16" aria-hidden="true" fill="#A238FF"><rect x="19" y="0" width="5" height="4"/><rect x="19" y="6" width="5" height="4"/><rect x="19" y="12" width="5" height="4"/><rect x="13" y="6" width="5" height="4"/><rect x="13" y="12" width="5" height="4"/><rect x="7" y="12" width="5" height="4"/><rect x="1" y="12" width="5" height="4"/></svg>`,
    },
    {
      key: "sp",
      label: "Spotify",
      href: `https://open.spotify.com/search/${q}`,
      svg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1DB954" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M7 15c3-1 7-1 10 1M7 12c3.5-1.2 8-1 10.5 1M7.5 9c4-1.4 8.5-1 11 1.2"/></svg>`,
    },
    {
      key: "yt",
      label: "YouTube",
      href: `https://www.youtube.com/results?search_query=${q}`,
      svg: `<svg width="20" height="14" viewBox="0 0 24 17" aria-hidden="true"><rect width="24" height="17" rx="4" fill="#FF0000"/><path d="M10 5.2 16.5 8.5 10 11.8Z" fill="#fff"/></svg>`,
    },
  ];
}

function trackLinksMarkup(item, track) {
  const query = [item.artist, track.title].filter(Boolean).join(" ");
  const providers = trackLinkProviders(query);

  return `
    <span class="track-links">
      ${providers.map((p) => `
      <a class="track-link track-link-${p.key}" href="${escapeHtml(p.href)}" target="_blank" rel="noopener noreferrer" aria-label="„${escapeHtml(track.title)}“ auf ${escapeHtml(p.label)} suchen">
        ${p.svg}
      </a>`).join("")}
    </span>`;
}

function tracklistMarkup(item, release) {
  const tracks = release?.tracklist || [];
  if (tracks.length === 0) {
    return `
      <h2 class="section-title">Tracklist</h2>
      <p class="note" style="margin-top:0;">Für diese Veröffentlichung liegt bei Discogs keine Tracklist vor.</p>`;
  }

  const rows = tracks
    .map((t) => {
      // Discogs markiert Seiten-/Abschnittsüberschriften als eigenen Typ.
      if (t.type_ && t.type_ !== "track") {
        return `<div class="track-heading">${escapeHtml(t.title)}</div>`;
      }
      return `
        <div class="track-row">
          <span><span class="pos">${escapeHtml(t.position || "")}</span>${escapeHtml(t.title)}</span>
          <span class="track-row-right">
            <span class="dur">${escapeHtml(t.duration || "")}</span>
            ${trackLinksMarkup(item, t)}
          </span>
        </div>`;
    })
    .join("");

  return `<h2 class="section-title">Tracklist</h2>${rows}`;
}

function detailsMarkup(item, release) {
  const rows = [
    ["Interpret", item.artist],
    ["Format", item.format],
    ["Jahr", item.year],
    ["Label", release?.labels?.[0]?.name],
    ["Katalognummer", release?.labels?.[0]?.catno],
    ["Genre", (release?.genres || []).join(", ")],
    ["Land", item.country],
    ["Barcode", item.barcode],
    ["Hinzugefügt", item.created_at ? new Date(item.created_at).toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" }) : null],
  ].filter(([, value]) => value !== null && value !== undefined && value !== "");

  return `
    <h2 class="section-title" style="margin-top:28px;">Details</h2>
    <dl class="meta-grid">
      ${rows.map(([k, v]) => `<div class="meta-row"><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd></div>`).join("")}
    </dl>`;
}

/* ---------- Marktwert ---------- */

// formatMoney(): siehe discogs.js -- dort für alle drei Seiten gemeinsam.

/** Zeigt einen Bereich nur, wenn low und high tatsächlich auseinanderliegen –
    beim lowest_price-Fallback (discogs-preis.ts) sind sie identisch. */
function valueRangeText(preis) {
  if (preis.low == null || preis.high == null || preis.low === preis.high) return null;
  return `${formatMoney(preis.low, preis.currency)} – ${formatMoney(preis.high, preis.currency)}`;
}

function valueTotalText(item, preis) {
  const n = clampQuantity(item.quantity);
  const stueckwert = preis.median ?? preis.low;
  if (n <= 1 || stueckwert == null) return null;
  return `${formatMoney(stueckwert * n, preis.currency)} für ${n} Exemplare`;
}

/** "" (kein Markup), solange Discogs nichts liefert – kein leerer Kasten. */
function valueMarkup(item, preis) {
  if (!preis || (preis.median == null && preis.low == null)) return "";
  const hauptwert = preis.median ?? preis.low;
  const range = valueRangeText(preis);
  const total = valueTotalText(item, preis);
  return `
    <div class="value-zone" id="value-zone">
      <div class="value-zone-row">
        <div>
          <div class="value-label">Marktwert</div>
          <span class="value-hint">${range ? escapeHtml(range) : "laut Discogs-Marktplatz"}</span>
        </div>
        <div style="text-align:right;">
          <div class="value-amount" id="value-amount">${escapeHtml(formatMoney(hauptwert, preis.currency))}</div>
          <div class="value-range" id="value-total">${total ? escapeHtml(total) : ""}</div>
        </div>
      </div>
      <p class="value-disclaimer">Richtpreis, kein garantierter Verkaufspreis – was Käufer oder Händler tatsächlich zahlen, kann abweichen.</p>
    </div>`;
}

/** Nur die Gesamt-Zeile nachziehen, wenn sich die Anzahl ändert –
    kein voller Re-Render nötig (spart einen Discogs-Preisabruf). */
function paintValueZone(item, preis) {
  const total = document.getElementById("value-total");
  if (!total || !preis) return;
  const text = valueTotalText(item, preis);
  total.textContent = text || "";
}

function communityMarkup(release) {
  const have = release?.community?.have;
  if (!have) return "";
  return `<p class="community-note">${have.toLocaleString("de-DE")} Sammler haben diesen Tonträger</p>`;
}

function saleButtonMarkup() {
  return `
    <div class="sale-cta-zone" id="sale-cta-zone">
      <button class="btn-secondary" type="button" data-action="sale-open" style="width:100%;">
        Verkaufstext erstellen
      </button>
    </div>`;
}

function dangerMarkup() {
  return `
    <div class="danger-zone" id="danger-zone">
      <button class="menu-item danger" type="button" data-action="ask-delete">
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>
        Aus Sammlung entfernen
      </button>
    </div>`;
}

/* ---------- Anzahl eigener Exemplare ---------- */

const QTY_MIN = 1;
const QTY_MAX = 10;

/**
 * Auf 1–10 begrenzen; alles Unbrauchbare (null, "", NaN) wird zu 1.
 * Die Datenbank prüft dasselbe (`check (quantity between 1 and 10)`) –
 * das hier ist kein Ersatz dafür, sondern verhindert nur, dass die
 * Buttons überhaupt gegen den Check laufen.
 */
function clampQuantity(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return QTY_MIN;
  return Math.min(QTY_MAX, Math.max(QTY_MIN, n));
}

function quantityHint(n) {
  return n === 1 ? "Ein Exemplar" : `${n} Exemplare in deiner Sammlung`;
}

function quantityMarkup(item) {
  const n = clampQuantity(item.quantity);
  return `
    <div class="qty-zone" id="quantity-zone">
      <div class="qty-label">
        Exemplare
        <span class="qty-hint">${escapeHtml(quantityHint(n))}</span>
      </div>
      <div class="qty-stepper">
        <button class="qty-btn" type="button" data-action="qty-dec"
                aria-label="Ein Exemplar weniger"${n <= QTY_MIN ? " disabled" : ""}>−</button>
        <span class="qty-value" id="qty-value" role="status" aria-live="polite">${n}</span>
        <button class="qty-btn" type="button" data-action="qty-inc"
                aria-label="Ein Exemplar mehr"${n >= QTY_MAX ? " disabled" : ""}>+</button>
      </div>
      <p class="err" id="qty-error" role="alert"></p>
    </div>`;
}

/**
 * Anzeige und Button-Zustände setzen. Bewusst kein erneutes innerHTML:
 * `#qty-value` ist eine Live-Region, die beim Neuaufbau ihre Ansage
 * verlieren würde.
 */
function paintQuantity(n) {
  const zone = document.getElementById("quantity-zone");
  if (!zone) return;
  zone.querySelector("#qty-value").textContent = n;
  zone.querySelector(".qty-hint").textContent = quantityHint(n);
  zone.querySelector('[data-action="qty-dec"]').disabled = n <= QTY_MIN;
  zone.querySelector('[data-action="qty-inc"]').disabled = n >= QTY_MAX;
}

/**
 * Neue Anzahl speichern. Der Wert am Objekt wird mitgeschrieben, weil
 * render() nach dem Discogs-Abruf ein zweites Mal läuft und sonst wieder
 * den alten Stand zeichnen würde. Schlägt das Update fehl, springt die
 * Anzeige zurück – gespeichert ist dann nichts.
 */
async function setQuantity(item, next) {
  const value = clampQuantity(next);
  const previous = clampQuantity(item.quantity);
  if (value === previous) return;

  const zone = document.getElementById("quantity-zone");
  const errorEl = document.getElementById("qty-error");
  errorEl.textContent = "";
  zone.querySelectorAll("button").forEach((b) => (b.disabled = true));

  const { error } = await sb.from("collection_items").update({ quantity: value }).eq("id", item.id);

  if (error) {
    errorEl.textContent = `Die Anzahl konnte nicht gespeichert werden: ${error.message}`;
    paintQuantity(previous);
    return;
  }

  item.quantity = value;
  paintQuantity(value);
  paintValueZone(item, currentPreis);
}

/* ---------- Löschen (zweistufig) ---------- */

function askDelete(item) {
  const zone = document.getElementById("danger-zone");
  zone.innerHTML = `
    <div class="confirm-box">
      <p>„${escapeHtml(item.title)}“ wirklich aus deiner Sammlung entfernen? Das lässt sich nicht rückgängig machen.</p>
      <div class="row">
        <button class="btn-secondary" type="button" data-action="cancel-delete">Abbrechen</button>
        <button class="btn-danger" type="button" data-action="confirm-delete">Entfernen</button>
      </div>
      <p class="err" id="delete-error" role="alert"></p>
    </div>`;
  zone.querySelector('[data-action="confirm-delete"]').focus();
}

async function confirmDelete(item) {
  const zone = document.getElementById("danger-zone");
  const errorEl = document.getElementById("delete-error");
  zone.querySelectorAll("button").forEach((b) => (b.disabled = true));
  errorEl.textContent = "";

  try {
    await deleteItem(item.id);
    // Ohne History-Eintrag zurück: der Eintrag existiert nicht mehr.
    location.replace("collection.html");
  } catch (e) {
    zone.querySelectorAll("button").forEach((b) => (b.disabled = false));
    errorEl.textContent = e.message;
  }
}

/* ---------- Seite ---------- */

/** Der gerade angezeigte Eintrag – der Klick-Listener unten liest ihn aus. */
let currentItem = null;
/** Zuletzt geladener Marktwert, für paintValueZone() bei Anzahl-Änderungen. */
let currentPreis = null;

function render(item, release, preis) {
  currentItem = item;
  currentPreis = preis || null;
  document.title = `${item.title} – CollectView`;
  shell.setAttribute("aria-busy", "false");
  shell.innerHTML = `
    ${heroMarkup(item)}
    <div class="detail-body">
      <h1 class="detail-title">${escapeHtml(item.title)}</h1>
      <div class="detail-artist">${escapeHtml(item.artist || "Unbekannter Interpret")}</div>
      <div class="detail-meta">${metaLine(item, release)}</div>
      ${quantityMarkup(item)}
      ${valueMarkup(item, preis)}
      ${saleButtonMarkup()}
      ${tracklistMarkup(item, release)}
      ${detailsMarkup(item, release)}
      ${communityMarkup(release)}
      ${dangerMarkup()}
    </div>`;
}

// Einmalig registriert: render() läuft zweimal (vor und nach dem
// Discogs-Abruf) und würde den Listener sonst verdoppeln.
shell.addEventListener("click", (e) => {
  const action = e.target.closest("[data-action]")?.dataset.action;
  if (!action || !currentItem) return;
  if (action === "qty-dec") setQuantity(currentItem, clampQuantity(currentItem.quantity) - 1);
  if (action === "qty-inc") setQuantity(currentItem, clampQuantity(currentItem.quantity) + 1);
  if (action === "sale-open") openSaleText(currentItem);
  if (action === "ask-delete") askDelete(currentItem);
  if (action === "cancel-delete") document.getElementById("danger-zone").outerHTML = dangerMarkup();
  if (action === "confirm-delete") confirmDelete(currentItem);
});

/* Hörlinks öffnen als echtes Popup-Fenster statt als neuer Tab/Seite.
   window.open() muss dafür SYNCHRON im Klick-Handler laufen (kein
   await, kein setTimeout davor) – nur dann lassen Popup-Blocker es
   durch, weil der Browser es noch als direkte Nutzeraktion erkennt. */
shell.addEventListener("click", (e) => {
  const link = e.target.closest(".track-link");
  if (!link) return;
  e.preventDefault();
  const w = 480, h = 760;
  const left = Math.max(0, (window.screen.width - w) / 2);
  const top = Math.max(0, (window.screen.height - h) / 2);
  const popup = window.open(
    link.href,
    "collectview-hoerlink",
    `popup=yes,width=${w},height=${h},left=${left},top=${top}`
  );
  // Vom Blocker verhindert (popup === null) oder als Tab statt Fenster
  // geöffnet (kein reines Popup-Verhalten möglich): dann normal als
  // neuer Tab öffnen statt den Klick ins Leere laufen zu lassen.
  if (!popup) {
    window.open(link.href, "_blank", "noopener,noreferrer");
  } else {
    popup.opener = null;
  }
});

function renderMissing(message) {
  shell.setAttribute("aria-busy", "false");
  shell.innerHTML = `
    <div class="detail-body" style="padding-top:60px;">
      ${emptyState({
        iconName: "alert",
        title: "Nicht gefunden",
        text: message,
        action: { href: "collection.html", label: "Zur Sammlung" },
      })}
    </div>`;
}

async function init() {
  const user = await requireAuth();
  if (!user) return;

  if (!itemId) {
    renderMissing("Diese Seite braucht einen Eintrag: detail.html?id=…");
    return;
  }

  try {
    const item = await fetchItem(itemId);
    if (!item) {
      renderMissing("Dieser Eintrag gehört nicht zu deiner Sammlung oder wurde bereits entfernt.");
      return;
    }

    // Erst mit den gespeicherten Daten rendern, dann mit Discogs anreichern:
    // die Seite ist sofort da, auch wenn Discogs langsam ist oder ausfällt.
    render(item, null, null);
    const [release, preis] = await Promise.all([
      fetchRelease(item.discogs_id),
      discogsPreis(item.discogs_id),
    ]);
    if (release || preis) render(item, release, preis);
  } catch (e) {
    // Kein Netz? Dann den Eintrag aus dem letzten Offline-Stand der
    // Sammlung zeigen (ohne Discogs-Anreicherung -- die braucht Netz).
    const cached = loadOfflineItem(user.id, itemId);
    if (cached) {
      render(cached, null, null);
      const notice = document.createElement("div");
      notice.className = "muted";
      notice.style.cssText = "font-size:12.5px; margin:10px 20px 0; padding:8px 12px; background:var(--surface-2); border-radius:var(--radius-sm);";
      notice.textContent = "Offline – zeigt den zuletzt gespeicherten Stand.";
      shell.insertAdjacentElement("afterbegin", notice);
      return;
    }
    shell.setAttribute("aria-busy", "false");
    shell.innerHTML = `<div class="detail-body" style="padding-top:60px;">${errorState(e.message)}</div>`;
  }
}

init();
