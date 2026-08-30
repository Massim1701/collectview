/* scanner.js – Barcode-Scan (ZXing) → Discogs-Lookup → Sammlung
   Auth läuft über requireAuth(); die Sammlung selbst lebt auf
   collection.html – hier steht nur die Bestätigung des letzten Scans. */

renderBottomNav(document.getElementById("bottomnav"), "search");

let codeReader = null;
let scanControls = null;
let scanning = false;

const RECENT_LIMIT = 3;

const videoEl = document.getElementById("video");
const frameEl = document.getElementById("scan-frame");
const scanBtn = document.getElementById("scan-btn");
const statusEl = document.getElementById("scan-status");
const resultsCard = document.getElementById("results-card");
const resultsEl = document.getElementById("results");
const recentEl = document.getElementById("recent-saved");

function setStatus(text, { active = false, busy = false } = {}) {
  statusEl.className = active ? "status active" : "status";
  statusEl.innerHTML = busy ? `<span class="spinner"></span>${escapeHtml(text)}` : escapeHtml(text);
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

async function lookupBarcode(barcode) {
  setStatus("Suche bei Discogs …", { active: true, busy: true });
  try {
    const res = await fetch(
      `https://api.discogs.com/database/search?barcode=${encodeURIComponent(barcode)}&type=release`,
    );
    if (!res.ok) throw new Error(`Discogs antwortete mit ${res.status}`);
    const data = await res.json();
    renderResults(data.results || [], barcode);
    setStatus(data.results?.length ? "Treffer gefunden – zum Speichern antippen." : "");
  } catch (e) {
    setStatus("Discogs-Suche fehlgeschlagen: " + e.message);
  }
}

function splitTitle(fullTitle) {
  const idx = fullTitle.indexOf(" - ");
  if (idx === -1) return ["", fullTitle];
  return [fullTitle.slice(0, idx), fullTitle.slice(idx + 3)];
}

function renderResults(results, barcode) {
  resultsCard.style.display = "block";

  if (results.length === 0) {
    resultsEl.innerHTML = emptyState({
      iconName: "search",
      title: "Keine Treffer",
      text: `Zu Barcode ${barcode} kennt Discogs keine Veröffentlichung. Bei älteren Platten ohne Barcode hilft später die Cover-Erkennung.`,
    });
    return;
  }

  resultsEl.innerHTML = "";
  results.slice(0, 8).forEach((r) => {
    const [artist, title] = splitTitle(r.title);
    const item = {
      id: r.id,
      discogs_id: r.id,
      title,
      artist,
      cover_url: r.cover_image || r.thumb || null,
      format: (r.format || []).join(", "),
      year: r.year || null,
    };

    const el = document.createElement("button");
    el.type = "button";
    el.className = "list-card result-card";
    el.style.cssText = "width:100%;text-align:left;font-family:inherit;color:inherit;cursor:pointer;";
    el.innerHTML = `
      ${coverMarkup(item, { size: 56 })}
      <div style="min-width:0;">
        <div class="list-card-title">${escapeHtml(title)}</div>
        <div class="list-card-sub">${[artist, item.format, r.year, r.country].filter(Boolean).map(escapeHtml).join(" · ")}</div>
      </div>
      <svg class="chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>`;
    el.addEventListener("click", () => addToCollection(r, artist, title, barcode, el));
    resultsEl.appendChild(el);
  });
}

/* ---------- Speichern ---------- */

async function addToCollection(discogsResult, artist, title, barcode, buttonEl) {
  if (!currentUser) return;

  buttonEl.disabled = true;
  setStatus("Wird gespeichert …", { active: true, busy: true });

  const { error } = await sb.from("collection_items").insert({
    user_id: currentUser.id,
    discogs_id: discogsResult.id,
    title,
    artist,
    format: (discogsResult.format || []).join(", "),
    year: discogsResult.year ? parseInt(discogsResult.year, 10) : null,
    country: discogsResult.country || null,
    barcode,
    cover_url: discogsResult.cover_image || discogsResult.thumb || null,
  });

  if (error) {
    buttonEl.disabled = false;
    setStatus("Konnte nicht gespeichert werden: " + error.message);
    return;
  }

  resultsCard.style.display = "none";
  setStatus(`„${title}“ ist in deiner Sammlung.`, { active: true });
  loadRecentlySaved();
}

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
