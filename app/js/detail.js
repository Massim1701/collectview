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
      ${coverMarkup(item)}
    </div>`;
}

/** "1991 · Vinyl, LP · DGC Records" – leere Angaben fallen weg. */
function metaLine(item, release) {
  const label = release?.labels?.[0]?.name;
  return [item.year, item.format, label].filter(Boolean).map(escapeHtml).join(" · ");
}

/**
 * Hörlinks. YouTube-Videos liefert Discogs direkt mit; für Spotify gibt es
 * keine ID im Datensatz, deshalb eine vorbereitete Suche statt eines Links,
 * der ins Leere zeigen könnte.
 */
function listenMarkup(item, release) {
  const query = [item.artist, item.title].filter(Boolean).join(" ");
  const video = (release?.videos || []).find((v) => /youtu\.?be/.test(v.uri || ""));

  const youtubeHref = video
    ? video.uri
    : `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
  const youtubeSub = video ? escapeHtml(video.title || "") : "Suche nach Interpret und Titel";

  return `
    <h2 class="section-title">Anhören</h2>
    <div class="link-stack">
      <a class="link-chip" href="${escapeHtml(youtubeHref)}" target="_blank" rel="noopener noreferrer">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="6 3 20 12 6 21 6 3"/></svg>
        <span>Auf YouTube ansehen<span class="chip-sub">${youtubeSub}</span></span>
      </a>
      <a class="link-chip" href="https://open.spotify.com/search/${encodeURIComponent(query)}" target="_blank" rel="noopener noreferrer">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M7 15c3-1 7-1 10 1M7 12c3.5-1.2 8-1 10.5 1M7.5 9c4-1.4 8.5-1 11 1.2"/></svg>
        <span>Auf Spotify suchen<span class="chip-sub">Öffnet die Suche nach „${escapeHtml(query)}“</span></span>
      </a>
    </div>`;
}

function tracklistMarkup(release) {
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
          <span class="dur">${escapeHtml(t.duration || "")}</span>
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

function communityMarkup(release) {
  const have = release?.community?.have;
  if (!have) return "";
  return `<p class="community-note">${have.toLocaleString("de-DE")} Sammler haben diesen Tonträger</p>`;
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

function render(item, release) {
  currentItem = item;
  document.title = `${item.title} – Plattenregal`;
  shell.setAttribute("aria-busy", "false");
  shell.innerHTML = `
    ${heroMarkup(item)}
    <div class="detail-body">
      <h1 class="detail-title">${escapeHtml(item.title)}</h1>
      <div class="detail-artist">${escapeHtml(item.artist || "Unbekannter Interpret")}</div>
      <div class="detail-meta">${metaLine(item, release)}</div>
      ${quantityMarkup(item)}
      ${listenMarkup(item, release)}
      ${tracklistMarkup(release)}
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
  if (action === "ask-delete") askDelete(currentItem);
  if (action === "cancel-delete") document.getElementById("danger-zone").outerHTML = dangerMarkup();
  if (action === "confirm-delete") confirmDelete(currentItem);
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
    render(item, null);
    const release = await fetchRelease(item.discogs_id);
    if (release) render(item, release);
  } catch (e) {
    // Kein Netz? Dann den Eintrag aus dem letzten Offline-Stand der
    // Sammlung zeigen (ohne Discogs-Anreicherung -- die braucht Netz).
    const cached = loadOfflineItem(user.id, itemId);
    if (cached) {
      render(cached, null);
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
