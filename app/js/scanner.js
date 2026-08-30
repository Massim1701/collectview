/* scanner.js – Scan-Ablauf: Barcode (ZXing) → Discogs → Statusabgleich → Ergebnis
   Auth läuft über requireAuth(); die Sammlung selbst lebt auf
   collection.html – hier steht nur der zuletzt gescannte Treffer.

   Ablauf nach Spezifikation:
     1. Barcode scannen
     2. Discogs-Suche; ein Treffer → direkt zum Ergebnis, mehrere → Liste,
        keiner → Hinweis mit "manuell anlegen"
     3. Abgleich mit Sammlung/Wunschliste (scan-status.js), parallel gestartet
     4. Ergebnisseite mit Statushinweis und den Aktionen
        Sammlung / Wunschliste / Verwerfen */

renderBottomNav(document.getElementById("bottomnav"), "search");

let codeReader = null;
let scanControls = null;
let scanning = false;

const RECENT_LIMIT = 3;

const videoEl = document.getElementById("video");
const frameEl = document.getElementById("scan-frame");
const scanBtn = document.getElementById("scan-btn");
const statusEl = document.getElementById("scan-status");
const noticeEl = document.getElementById("scan-notice");
const resultsCard = document.getElementById("results-card");
const resultsEl = document.getElementById("results");
const resultsTitleEl = document.getElementById("results-title");
const resultsSubEl = document.getElementById("results-sub");
const recentEl = document.getElementById("recent-saved");

/** Treffer und Statusdaten des laufenden Scans. */
let currentScan = { barcode: null, results: [], statusData: emptyScanStatusData() };

function setStatus(text, { active = false, busy = false } = {}) {
  statusEl.className = active ? "status active" : "status";
  statusEl.innerHTML = busy ? `<span class="spinner"></span>${escapeHtml(text)}` : escapeHtml(text);
}

function setResultsHead(title, sub) {
  resultsTitleEl.textContent = title;
  resultsSubEl.textContent = sub;
}

/* ---------- Barcode-Scan ---------- */

async function toggleScan() {
  if (scanning) {
    stopScan();
    return;
  }

  try {
    codeReader = new ZXingBrowser.BrowserMultiFormatReader();
    frameEl.classList.add("live");
    scanning = true;
    scanBtn.textContent = "Scan stoppen";
    setStatus("Kamera wird gestartet …", { active: true, busy: true });

    const devices = await ZXingBrowser.BrowserCodeReader.listVideoInputDevices();
    const deviceId = devices[devices.length - 1]?.deviceId; // meist die Rückkamera zuletzt

    scanControls = await codeReader.decodeFromVideoDevice(deviceId, videoEl, (result) => {
      if (!result) return;
      setStatus("Erkannt: " + result.getText());
      lookupBarcode(result.getText());
      stopScan();
    });

    setStatus("Barcode im Rahmen positionieren …", { active: true });
  } catch (e) {
    scanning = false;
    frameEl.classList.remove("live");
    scanBtn.textContent = "Barcode-Scan starten";
    setStatus("Kamera-Zugriff fehlgeschlagen: " + e.message);
  }
}

function stopScan() {
  if (scanControls) {
    scanControls.stop();
    scanControls = null;
  }
  scanning = false;
  frameEl.classList.remove("live");
  scanBtn.textContent = "Barcode-Scan starten";
}

// Kamera freigeben, wenn die Seite verlassen oder in den Hintergrund geschoben wird.
window.addEventListener("pagehide", stopScan);
document.addEventListener("visibilitychange", () => {
  if (document.hidden && scanning) stopScan();
});

/* ---------- Discogs ---------- */

/**
 * Hinweis auf das Discogs-Rate-Limit (25 Anfragen pro Minute und IP).
 * Auf Börsen und Messen teilen sich viele Besucher dieselbe WLAN-IP, das
 * Limit ist dann schnell erreicht. Der Hinweis bleibt bewusst stehen, bis
 * eine Suche wieder durchgeht – niemand soll ihn wegblinzeln, während er
 * gerade die Netzwerkeinstellungen umstellt.
 */
function showRateLimitNotice(barcode) {
  noticeEl.hidden = false;
  noticeEl.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9"/><path d="M12 8v4.5M12 16h.01"/>
    </svg>
    <div class="notice-body">
      <strong>Gerade viele Scans im selben WLAN?</strong>
      <span>Schalte auf mobiles Internet um, dann hast du dein eigenes Limit.</span>
      <button class="btn-secondary small" type="button" data-action="retry-lookup">Erneut versuchen</button>
    </div>`;
  noticeEl.querySelector('[data-action="retry-lookup"]')
    .addEventListener("click", () => lookupBarcode(barcode));
}

function hideRateLimitNotice() {
  noticeEl.hidden = true;
  noticeEl.innerHTML = "";
}

function splitTitle(fullTitle) {
  const idx = fullTitle.indexOf(" - ");
  if (idx === -1) return ["", fullTitle];
  return [fullTitle.slice(0, idx), fullTitle.slice(idx + 3)];
}

/** Discogs-Suchtreffer auf die Felder bringen, die collection_items kennt. */
function normalizeResult(r, barcode) {
  const [artist, title] = splitTitle(r.title || "");
  return {
    discogs_id: r.id,
    title,
    artist,
    format: (r.format || []).join(", "),
    year: r.year ? parseInt(r.year, 10) : null,
    country: r.country || null,
    barcode: barcode || null,
    cover_url: r.cover_image || r.thumb || null,
  };
}

async function lookupBarcode(barcode) {
  setStatus("Suche bei Discogs …", { active: true, busy: true });
  resultsCard.style.display = "none";

  // Schritt 3 startet hier, nicht nach der Discogs-Antwort: der Barcode
  // steht schon fest. Fehler beim Abgleich dürfen den Scan nicht kippen.
  const collectionByBarcode = fetchCollectionByBarcode(barcode).catch(() => []);

  try {
    const res = await fetch(
      `https://api.discogs.com/database/search?barcode=${encodeURIComponent(barcode)}&type=release`,
    );

    // 429 = Rate Limit. Bewusst kein automatischer Neuversuch: das würde
    // das Limit nur weiter belasten. Der Nutzer entscheidet, wann erneut.
    if (res.status === 429) {
      showRateLimitNotice(barcode);
      setStatus("Discogs bremst gerade – Limit von 25 Anfragen pro Minute erreicht.");
      return;
    }

    if (!res.ok) throw new Error(`Discogs antwortete mit ${res.status}`);

    const data = await res.json();
    hideRateLimitNotice();

    const results = (data.results || []).slice(0, 8).map((r) => normalizeResult(r, barcode));
    await showScan(barcode, results, collectionByBarcode);
  } catch (e) {
    setStatus("Discogs-Suche fehlgeschlagen: " + e.message);
  }
}

/**
 * Trefferzahl entscheidet über die Ansicht: einer geht direkt aufs
 * Ergebnis, mehrere in die Auswahl, keiner in den Hinweis.
 */
async function showScan(barcode, results, collectionByBarcodePromise) {
  const ids = results.map((r) => r.discogs_id);

  // Die restlichen Statusdaten hängen an der discogs_id und können erst
  // jetzt geholt werden – eine Sammelabfrage für alle Treffer zusammen.
  const [byBarcode, byId, wished] = await Promise.all([
    collectionByBarcodePromise,
    fetchCollectionByDiscogsIds(ids).catch(() => []),
    fetchWishlistByDiscogsIds(ids).catch(() => []),
  ]);

  currentScan = {
    barcode,
    results,
    statusData: { collection: [...byBarcode, ...byId], wishlist: wished },
  };

  resultsCard.style.display = "block";

  if (results.length === 0) {
    renderNoMatch(barcode);
    setStatus("");
    return;
  }

  if (results.length === 1) {
    renderResult(results[0]);
    setStatus("");
    return;
  }

  renderResultList();
  setStatus("");
}

/* ---------- Schritt 2: Trefferliste ---------- */

function renderResultList() {
  const { results, barcode } = currentScan;
  setResultsHead(`${results.length} Treffer gefunden`, `Barcode ${barcode} · welche Ausgabe hast du?`);

  resultsEl.innerHTML = "";
  results.forEach((item, index) => {
    const status = scanStatusFor(item, currentScan.statusData);
    const hint = status.inCollection
      ? `<span class="scan-chip is-owned">In der Sammlung</span>`
      : status.onWishlist
        ? `<span class="scan-chip is-wished">Wunschliste</span>`
        : "";

    const el = document.createElement("button");
    el.type = "button";
    el.className = "list-card result-card";
    el.style.cssText = "width:100%;text-align:left;font-family:inherit;color:inherit;cursor:pointer;";
    el.innerHTML = `
      ${coverMarkup(item, { size: 56 })}
      <div style="min-width:0;">
        <div class="list-card-title">${escapeHtml(item.title)}</div>
        <div class="list-card-sub">${[item.artist, item.format, item.year, item.country].filter(Boolean).map(escapeHtml).join(" · ")}</div>
        ${hint}
      </div>
      <svg class="chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>`;
    el.addEventListener("click", () => renderResult(currentScan.results[index]));
    resultsEl.appendChild(el);
  });

  resultsEl.insertAdjacentHTML("beforeend", manualHintMarkup());
}

function renderNoMatch(barcode) {
  setResultsHead("Keine Treffer", `Barcode ${barcode}`);
  resultsEl.innerHTML =
    emptyState({
      iconName: "search",
      title: "Nicht gefunden",
      text: `Zu Barcode ${barcode} kennt Discogs keine Veröffentlichung. Bei älteren Platten ohne Barcode hilft später die Cover-Erkennung.`,
    }) + manualHintMarkup();
}

function manualHintMarkup() {
  return `
    <p class="manual-hint">Nicht dabei?
      <button type="button" class="linklike" data-action="manual-open">Manuell anlegen</button>
    </p>`;
}

/* ---------- Schritt 4: Ergebnis ---------- */

/** Hörlinks wie auf der Detailseite: Discogs liefert in der Suche keine
    Streaming-IDs, deshalb vorbereitete Suchen statt toter Links. */
function streamingMarkup(item) {
  const query = [item.artist, item.title].filter(Boolean).join(" ");
  const q = encodeURIComponent(query);
  const links = [
    ["Spotify", `https://open.spotify.com/search/${q}`],
    ["Apple Music", `https://music.apple.com/search?term=${q}`],
    ["YouTube Music", `https://music.youtube.com/search?q=${q}`],
  ];
  return `
    <div class="scan-streaming">
      ${links.map(([label, href]) =>
        `<a class="scan-stream-link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`).join("")}
    </div>`;
}

function renderResult(item) {
  currentScan.selected = item;
  const status = scanStatusFor(item, currentScan.statusData);
  const many = currentScan.results.length > 1;

  setResultsHead("Treffer", many ? "Andere Ausgabe? Zurück zur Auswahl." : `Barcode ${currentScan.barcode}`);

  resultsEl.innerHTML = `
    ${many ? `<button type="button" class="linklike" data-action="back-to-list">← Zurück zur Auswahl</button>` : ""}
    <div class="scan-result">
      ${coverMarkup(item, { size: 92 })}
      <div style="min-width:0;">
        <div class="scan-result-title">${escapeHtml(item.title)}</div>
        <div class="scan-result-artist">${escapeHtml(item.artist || "Unbekannter Interpret")}</div>
        <div class="scan-result-meta">${[item.year, item.format, item.country].filter(Boolean).map(escapeHtml).join(" · ")}</div>
      </div>
    </div>
    ${scanStatusMarkup(status)}
    ${streamingMarkup(item)}
    <div class="scan-actions">
      <button class="btn-primary" type="button" data-action="add-collection"${status.inCollection ? " disabled" : ""}>
        ${status.inCollection ? "Schon in der Sammlung" : "Zur Sammlung"}
      </button>
      <button class="btn-secondary" type="button" data-action="add-wishlist"${status.inCollection || status.onWishlist ? " disabled" : ""}>Auf Wunschliste</button>
      <button class="btn-secondary" type="button" data-action="discard">Verwerfen</button>
    </div>
    <p class="err" id="scan-error" role="alert"></p>`;
}

/* ---------- Manuell anlegen ---------- */

function renderManualForm() {
  setResultsHead("Manuell anlegen", "Titel genügt, der Rest ist freiwillig.");
  resultsEl.innerHTML = `
    <form id="manual-form" class="manual-form">
      <input class="field" id="manual-title" placeholder="Titel" required>
      <input class="field" id="manual-artist" placeholder="Interpret">
      <input class="field" id="manual-format" placeholder="Format (z. B. Vinyl, LP)">
      <input class="field" id="manual-year" type="number" min="1900" max="2100" placeholder="Jahr">
      <div class="scan-actions">
        <button class="btn-primary" type="submit">Zur Sammlung</button>
        <button class="btn-secondary" type="button" data-action="discard">Abbrechen</button>
      </div>
      <p class="err" id="scan-error" role="alert"></p>
    </form>`;

  document.getElementById("manual-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const title = document.getElementById("manual-title").value.trim();
    if (!title) return;
    const yearRaw = document.getElementById("manual-year").value;
    await saveToCollection({
      discogs_id: null,
      title,
      artist: document.getElementById("manual-artist").value.trim() || null,
      format: document.getElementById("manual-format").value.trim() || null,
      year: yearRaw ? parseInt(yearRaw, 10) : null,
      country: null,
      barcode: currentScan.barcode,
      cover_url: null,
    });
  });
}

/* ---------- Speichern ---------- */

function scanError(message) {
  const el = document.getElementById("scan-error");
  if (el) el.textContent = message;
}

/**
 * Eintrag anlegen. Der Free-Limit-Trigger meldet sich hier als Fehler –
 * dann statt der rohen Meldung ein Hinweis auf das Abo.
 */
async function saveToCollection(item) {
  if (!currentUser) return;
  scanError("");

  const { error } = await sb.from("collection_items").insert({
    user_id: currentUser.id,
    discogs_id: item.discogs_id,
    title: item.title,
    artist: item.artist,
    format: item.format,
    year: item.year,
    country: item.country,
    barcode: item.barcode,
    cover_url: item.cover_url,
  });

  if (error) {
    scanError(/limit/i.test(error.message)
      ? "Das Free-Limit ist erreicht. Mit Plattenregal Plus ist die Sammlung unbegrenzt."
      : "Konnte nicht gespeichert werden: " + error.message);
    return;
  }

  resultsCard.style.display = "none";
  setStatus(`„${item.title}“ ist in deiner Sammlung.`, { active: true });
  loadRecentlySaved();
}

async function saveToWishlist(item) {
  if (!currentUser) return;
  scanError("");
  try {
    await addWishlistItem({
      user_id: currentUser.id,
      title: item.title,
      artist: item.artist,
      format: item.format,
      year: item.year,
    });
    resultsCard.style.display = "none";
    setStatus(`„${item.title}“ steht auf deiner Wunschliste.`, { active: true });
  } catch (e) {
    scanError("Konnte nicht gemerkt werden: " + e.message);
  }
}

/** Wunschlisten-Treffer in die Sammlung übernehmen und dort entfernen. */
async function moveWishlistToCollection(item, wishlistRow) {
  await saveToCollection(item);
  try {
    await removeWishlistItem(wishlistRow.id);
  } catch {
    // Der Eintrag liegt jetzt doppelt vor – kein Grund für eine Fehlermeldung,
    // die Sammlung stimmt. Die Wunschliste lässt sich dort aufräumen.
  }
}

function discardResult() {
  resultsCard.style.display = "none";
  setStatus("Verworfen. Bereit für den nächsten Scan.");
}

resultsEl.addEventListener("click", (e) => {
  const action = e.target.closest("[data-action]")?.dataset.action;
  const item = currentScan.selected;
  if (!action) return;
  if (action === "manual-open") renderManualForm();
  if (action === "back-to-list") renderResultList();
  if (action === "discard") discardResult();
  if (!item) return;
  if (action === "add-collection") saveToCollection(item);
  if (action === "add-wishlist") saveToWishlist(item);
  if (action === "wishlist-to-collection") {
    moveWishlistToCollection(item, scanStatusFor(item, currentScan.statusData).onWishlist);
  }
});

/* ---------- Zuletzt gespeichert ---------- */

async function loadRecentlySaved() {
  try {
    const items = await fetchCollection();
    document.getElementById("recent-count").textContent = items.length
      ? `${items.length} gesamt`
      : "";

    recentEl.innerHTML = items.length
      ? items.slice(0, RECENT_LIMIT).map(listCardMarkup).join("")
      : emptyState({
          iconName: "grid",
          text: "Noch nichts gescannt. Der erste Treffer landet direkt hier.",
        });
  } catch (e) {
    recentEl.innerHTML = errorState(e.message);
  }
}

/* ---------- Start ---------- */

async function init() {
  const user = await requireAuth();
  if (!user) return;

  renderAccountRow(document.getElementById("account-card"), user);
  scanBtn.addEventListener("click", toggleScan);
  loadRecentlySaved();
}

init();
