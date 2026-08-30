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
let coverStream = null;

/** "barcode" oder "cover" – steuert, welche Kamerafunktion der Scan-Button startet. */
let mode = "barcode";

const RECENT_LIMIT = 3;

const videoEl = document.getElementById("video");
const frameEl = document.getElementById("scan-frame");
const scanBtn = document.getElementById("scan-btn");
const captureBtn = document.getElementById("capture-btn");
const cameraSelect = document.getElementById("camera-select");
const modeToggle = document.getElementById("mode-toggle");
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

/* ---------- Modus & Kameraauswahl ----------
   Am Rechner hängen oft mehrere Kameras dran (eingebaute Webcam + externe
   USB-Webcam). Die Liste füllt sich erst NACH der ersten Kamerafreigabe,
   weil Browser Gerätenamen sonst aus Datenschutzgründen leer lassen. */

function setMode(next) {
  if (scanning || coverStream) stopScan();
  mode = next;
  modeToggle.querySelectorAll(".segmented-item").forEach((el) => {
    el.classList.toggle("active", el.dataset.mode === mode);
  });
  scanBtn.textContent = mode === "barcode" ? "Barcode-Scan starten" : "Kamera starten";
  captureBtn.hidden = true;
}

modeToggle.addEventListener("click", (e) => {
  const el = e.target.closest("[data-mode]");
  if (el) setMode(el.dataset.mode);
});

async function refreshCameraList(selectedId) {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter((d) => d.kind === "videoinput");
    if (cams.length < 2) {
      cameraSelect.hidden = true;
      cameraSelect.innerHTML = "";
      return;
    }
    cameraSelect.innerHTML = cams
      .map((d, i) => `<option value="${escapeHtml(d.deviceId)}">${escapeHtml(d.label || "Kamera " + (i + 1))}</option>`)
      .join("");
    if (selectedId) cameraSelect.value = selectedId;
    cameraSelect.hidden = false;
  } catch {
    // Kein Zugriff auf enumerateDevices (z. B. kein https) – dann bleibt es
    // bei der Standardkamera, kein Grund den Scan abzubrechen.
  }
}

cameraSelect.addEventListener("change", () => {
  if (mode === "barcode" && scanning) {
    stopScan();
    toggleScan();
  } else if (mode === "cover" && coverStream) {
    startCoverCamera();
  }
});

/* ---------- Barcode-Scan ---------- */

async function toggleScan() {
  if (mode !== "barcode") return;
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

    // Ohne ausdrückliche Wahl NICHT raten. Die alte Annahme "Rückkamera
    // steht zuletzt" geht auf Telefonen mit mehreren Rückkameras schief:
    // ein iPhone Pro meldet Ultraweitwinkel, Weitwinkel und Tele einzeln,
    // und ausgerechnet das Tele kann nicht nah genug fokussieren, um
    // einen Barcode auf einer Plattenhülle zu lesen. Vor der ersten
    // Freigabe liefert enumerateDevices auf iOS ohnehin leere deviceIds.
    //
    // undefined lässt ZXing auf facingMode "environment" zurückfallen –
    // dieselbe Wahl, die der Cover-Weg unten schon trifft. Das System
    // gibt dabei die Hauptkamera, nicht irgendeine.
    const deviceId = cameraSelect.value || undefined;

    scanControls = await codeReader.decodeFromVideoDevice(deviceId, videoEl, (result) => {
      if (!result) return;
      setStatus("Erkannt: " + result.getText());
      lookupBarcode(result.getText());
      stopScan();
    });

    await refreshCameraList(deviceId);
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
  if (coverStream) {
    coverStream.getTracks().forEach((t) => t.stop());
    coverStream = null;
    videoEl.srcObject = null;
  }
  scanning = false;
  frameEl.classList.remove("live");
  captureBtn.hidden = true;
  scanBtn.textContent = mode === "barcode" ? "Barcode-Scan starten" : "Kamera starten";
}

// Kamera freigeben, wenn die Seite verlassen oder in den Hintergrund geschoben wird.
window.addEventListener("pagehide", stopScan);
document.addEventListener("visibilitychange", () => {
  if (document.hidden && (scanning || coverStream)) stopScan();
});

/* ---------- Cover-Foto ---------- */

async function startCoverCamera() {
  try {
    if (coverStream) coverStream.getTracks().forEach((t) => t.stop());
    const deviceId = cameraSelect.value || undefined;
    coverStream = await navigator.mediaDevices.getUserMedia({
      video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: "environment" },
    });
    videoEl.srcObject = coverStream;
    frameEl.classList.add("live");
    scanning = true;
    scanBtn.textContent = "Kamera stoppen";
    captureBtn.hidden = false;
    setStatus("Cover gut ausgeleuchtet in den Rahmen halten, dann „Foto aufnehmen“.", { active: true });
    await refreshCameraList(deviceId);
  } catch (e) {
    setStatus("Kamera-Zugriff fehlgeschlagen: " + e.message);
  }
}

function toggleCoverCamera() {
  if (coverStream) {
    stopScan();
  } else {
    startCoverCamera();
  }
}

/** Frame aus dem Video ziehen und per Tesseract.js (läuft im Browser, kein
    externer Dienst nötig) auf Text untersuchen – Titel/Interpret stehen
    meist irgendwo auf dem Cover, exakt ist die Erkennung aber nicht.
    Deshalb landet das Ergebnis editierbar in einem Suchfeld statt direkt
    in einer Discogs-Suche. */
async function captureCoverPhoto() {
  if (!coverStream) return;
  captureBtn.disabled = true;
  setStatus("Text auf dem Cover wird gelesen …", { active: true, busy: true });

  const canvas = document.createElement("canvas");
  canvas.width = videoEl.videoWidth;
  canvas.height = videoEl.videoHeight;
  canvas.getContext("2d").drawImage(videoEl, 0, 0);

  let guess = "";
  try {
    // Worker und WASM-Kern liegen lokal (app/vendor) – ohne diese Pfade
    // holt tesseract.js sie zur Laufzeit vom CDN, und die App wäre dort
    // ohne Netz blind. Die Sprachdaten (langPath) bleiben bewusst am
    // CDN: deu+eng wären rund 30 MB im Bundle. Sie werden einmal geladen
    // und danach von tesseract.js in IndexedDB gehalten.
    const { data } = await Tesseract.recognize(canvas, "deu+eng", {
      workerPath: "./vendor/tesseract-worker.min.js",
      corePath: "./vendor/tesseract-core/",
    });
    guess = (data.text || "")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length >= 3 && /[a-zA-ZäöüÄÖÜ]/.test(l))
      .slice(0, 2)
      .join(" ");
  } catch (e) {
    setStatus("Texterkennung fehlgeschlagen – Text von Hand eintragen.", { active: true });
  }

  captureBtn.disabled = false;
  setStatus("");
  renderCoverGuessForm(guess);
}

function renderCoverGuessForm(guess) {
  resultsCard.style.display = "block";
  setResultsHead("Cover-Foto", "Erkannter Text – bei Bedarf korrigieren, dann suchen.");
  resultsEl.innerHTML = `
    <form id="cover-guess-form" class="manual-form">
      <input class="field" id="cover-guess-text" placeholder="Titel und/oder Interpret" value="${escapeHtml(guess)}">
      <div class="scan-actions">
        <button class="btn-primary" type="submit">Bei Discogs suchen</button>
        <button class="btn-secondary" type="button" data-action="discard">Verwerfen</button>
      </div>
      <p class="err" id="scan-error" role="alert"></p>
    </form>`;
  document.getElementById("cover-guess-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const text = document.getElementById("cover-guess-text").value.trim();
    if (text) lookupCoverText(text);
  });
}

/** Wie lookupBarcode, aber Freitextsuche statt Barcode – barcode/collection-
    Abgleich läuft hier nur über die discogs_id, ein Barcode ist ja unbekannt. */
async function lookupCoverText(text, { counted = false } = {}) {
  // Erst das alte Ergebnis wegräumen, dann fragen, ob gesucht werden darf:
  // sonst steht der vorige Treffer noch da, während der Limit-Hinweis kommt.
  resultsCard.style.display = "none";
  if (!(await allowScan("cover", text, counted))) return;

  setStatus("Suche bei Discogs …", { active: true, busy: true });

  try {
    const res = await fetch(
      `https://api.discogs.com/database/search?q=${encodeURIComponent(text)}&type=release`,
    );
    if (res.status === 429) {
      showRateLimitNotice(text, lookupCoverText);
      setStatus("Discogs bremst gerade – Limit von 25 Anfragen pro Minute erreicht.");
      return;
    }
    if (!res.ok) throw new Error(`Discogs antwortete mit ${res.status}`);

    const data = await res.json();
    hideRateLimitNotice();
    const results = (data.results || []).slice(0, 8).map((r) => normalizeResult(r, null));
    await showScan(null, results, Promise.resolve([]));
  } catch (e) {
    setStatus("Discogs-Suche fehlgeschlagen: " + e.message);
  }
}

/* ---------- Discogs ---------- */

/**
 * Hinweis auf das Discogs-Rate-Limit (25 Anfragen pro Minute und IP).
 * Auf Börsen und Messen teilen sich viele Besucher dieselbe WLAN-IP, das
 * Limit ist dann schnell erreicht. Der Hinweis bleibt bewusst stehen, bis
 * eine Suche wieder durchgeht – niemand soll ihn wegblinzeln, während er
 * gerade die Netzwerkeinstellungen umstellt.
 */
function showRateLimitNotice(term, retryFn = lookupBarcode) {
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
    .addEventListener("click", () => retryFn(term, { counted: true }));
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

/* ---------- Free-Limit auf Scans ---------- */

/** Stand des Kontingents für die Anzeige; verbindlich ist der Trigger. */
let scanQuota = { used: 0, subscribed: false, known: false };

async function refreshScanQuota() {
  if (!currentUser) return;
  try {
    const [used, subscribed] = await Promise.all([
      fetchScanCount(currentUser.id),
      fetchIsSubscribed(currentUser.id).catch(() => false),
    ]);
    scanQuota = { used, subscribed, known: true };
  } catch {
    // Kontingent unbekannt – dann eben ohne Anzeige. Der Trigger zählt
    // trotzdem, hier fehlt nur der Hinweis vorher.
    scanQuota.known = false;
  }
  paintScanQuota();
}

function paintScanQuota() {
  const el = document.getElementById("scan-quota");
  if (!el) return;
  el.textContent = scanQuota.known ? scanQuotaText(scanQuota.used, scanQuota.subscribed) : "";
}

/**
 * Darf gesucht werden? Der Insert in scan_events ist die Erlaubnis –
 * lehnt der Trigger ab, kommt es gar nicht erst zur Discogs-Anfrage.
 *
 * `counted` ist für den Neuversuch nach einem Rate-Limit: dass Discogs
 * bremst, ist nicht die Schuld des Nutzers und kostet keinen zweiten Scan.
 */
async function allowScan(source, term, counted) {
  if (counted) return true;
  if (!currentUser) return false;

  const result = await recordScan(currentUser.id, source, term);

  if (result.limitReached) {
    noticeEl.hidden = false;
    noticeEl.innerHTML = scanLimitNoticeMarkup();
    setStatus("");
    scanQuota = { ...scanQuota, used: FREE_SCAN_LIMIT, known: true };
    paintScanQuota();
    return false;
  }

  if (!result.ok) {
    setStatus("Scan konnte nicht gezählt werden: " + result.message);
    return false;
  }

  scanQuota.used += 1;
  paintScanQuota();
  return true;
}

/* ---------- Suche ---------- */

async function lookupBarcode(barcode, { counted = false } = {}) {
  // Erst das alte Ergebnis wegräumen, dann fragen, ob gesucht werden darf:
  // sonst steht der vorige Treffer noch da, während der Limit-Hinweis kommt.
  resultsCard.style.display = "none";
  if (!(await allowScan("barcode", barcode, counted))) return;

  setStatus("Suche bei Discogs …", { active: true, busy: true });

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
  const source = barcode ? `Barcode ${barcode}` : "Cover-Suche";
  setResultsHead(`${results.length} Treffer gefunden`, `${source} · welche Ausgabe hast du?`);

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
  const source = barcode ? `Barcode ${barcode}` : "Cover-Suche";
  setResultsHead("Keine Treffer", source);
  resultsEl.innerHTML =
    emptyState({
      iconName: "search",
      title: "Nicht gefunden",
      text: barcode
        ? `Zu Barcode ${barcode} kennt Discogs keine Veröffentlichung. Bei älteren Platten ohne Barcode hilft die Cover-Suche.`
        : "Discogs kennt dazu nichts. Text anpassen oder manuell anlegen.",
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

  setResultsHead("Treffer", many ? "Andere Ausgabe? Zurück zur Auswahl." : (currentScan.barcode ? `Barcode ${currentScan.barcode}` : "Cover-Suche"));

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
    // discogs_id, Cover und Barcode gehören mit: nur damit erkennt ein
    // späterer Scan den Eintrag wieder (Schritt 3) und die Wunschliste
    // kann das Cover zeigen. Von Hand angelegte Einträge auf
    // wishlist.html haben das naturgemäß nicht.
    await addWishlistItem({
      user_id: currentUser.id,
      discogs_id: item.discogs_id,
      title: item.title,
      artist: item.artist,
      format: item.format,
      year: item.year,
      cover_url: item.cover_url,
      barcode: item.barcode,
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
  scanBtn.addEventListener("click", () => {
    if (mode === "barcode") toggleScan();
    else toggleCoverCamera();
  });
  captureBtn.addEventListener("click", captureCoverPhoto);
  loadRecentlySaved();
  refreshScanQuota();
}

init();
