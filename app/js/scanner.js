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
const torchBtn = document.getElementById("torch-btn");
const cameraSelect = document.getElementById("camera-select");
const modeToggle = document.getElementById("mode-toggle");
const statusEl = document.getElementById("scan-status");
const noticeEl = document.getElementById("scan-notice");
const resultsCard = document.getElementById("results-card");
const resultsEl = document.getElementById("results");
const resultsTitleEl = document.getElementById("results-title");
const resultsSubEl = document.getElementById("results-sub");
const recentEl = document.getElementById("recent-saved");
const codeForm = document.getElementById("code-form");
const codeInput = document.getElementById("code-input");

/** Treffer und Statusdaten des laufenden Scans. */
let currentScan = { barcode: null, results: [], statusData: emptyScanStatusData() };

/**
 * Der nebenher laufende Katalog-Schreibvorgang des aktuellen Scans.
 *
 * saveToCollection wartet darauf, bevor es selbst schreibt: wer sofort
 * nach dem Treffer auf "Zur Sammlung" tippt, würde sonst denselben
 * Eintrag ein zweites Mal anlegen. Warten kostet nichts – die Anfrage
 * läuft zu dem Zeitpunkt längst.
 */
let katalogLaeuft = null;

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
  // Barcode: flaches Band. Cover: höheres Fenster für die quadratische Hülle.
  frameEl.classList.toggle("cover-mode", mode === "cover");
  captureBtn.hidden = true;
}

modeToggle.addEventListener("click", (e) => {
  const el = e.target.closest("[data-mode]");
  if (el) setMode(el.dataset.mode);
});

/* ---------- Kamera-Constraints ---------- */

/**
 * Auflösung ist hier kein Luxus, sondern der Unterschied zwischen
 * "geht" und "geht nicht".
 *
 * ZXing startet ohne Angabe mit den Standardwerten des Browsers, in der
 * Regel 640×480. Ein EAN-13 ist rund 3 cm breit und hat 95 Module; bei
 * 640px Bildbreite muss der Code fast das halbe Bild füllen, damit ein
 * Modul überhaupt auf mehr als einen Pixel fällt. Das zwingt zu einem
 * Abstand von wenigen Zentimetern – und da ist die Hauptkamera des
 * iPhone am Ende, sie stellt erst ab etwa 10 cm scharf. Ergebnis:
 * nah genug zum Auflösen heißt zu nah zum Fokussieren.
 *
 * Mit 1280px Breite reicht ein Abstand von 20–30 cm: füllt der Code ein
 * Drittel des Bildes, fallen noch rund 4 Pixel auf ein Modul. Das liegt
 * bequem im Schärfebereich, ohne dass man die Hülle an die Linse hält.
 *
 * Nicht mehr 1920: der Leser rechnet jedes Bild vollständig durch, und
 * 1080p kostet gut das Doppelte, ohne beim Erkennen zu helfen. Auf dem
 * Telefon ging dabei so viel Zeit auf dem Hauptthread verloren, dass das
 * Vorschaubild stockte.
 */
const KAMERA_IDEAL = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  // Bewusst nichts weiter: focusMode stand hier einmal, ohne dass je
  // belegt war, dass es etwas bewirkt. Bei einem Kernstück, das schon
  // zweimal an gut gemeinten Zusätzen gescheitert ist, fliegt raus, was
  // nicht nachweislich hilft.
};

/** Ausdrücklich gewählte Kamera, sonst die Rückkamera des Systems. */
function videoConstraints() {
  // Eine fest gewählte Kamera ist stabiler als facingMode: dabei
  // entscheidet iOS selbst und liefert unter Umständen ein virtuelles
  // Mehrfach-Gerät, das beim Zoomen die Linse wechselt.
  const id = cameraSelect.value || gemerkteKamera();
  return id
    ? { deviceId: { exact: id }, ...KAMERA_IDEAL }
    : { facingMode: { ideal: "environment" }, ...KAMERA_IDEAL };
}

/**
 * Nach dem Start: nachschärfen, soweit das Gerät es zulässt, und
 * zurückmelden, was tatsächlich herauskam. Die Rückmeldung ist kein
 * Selbstzweck – ohne sie lässt sich am Telefon nicht unterscheiden, ob
 * die Wunschauflösung durchkam oder still auf 640×480 gefallen ist.
 */
function kameraFeinschliff() {
  const track = videoEl.srcObject?.getVideoTracks?.()[0];
  if (!track) return "";

  // Hier stand einmal ein applyConstraints() für den Dauerfokus. Das
  // ist raus: auf iOS beendet ein applyConstraints auf dem laufenden
  // Kamerastrom den Track – die Kamera ging nach etwa zwei Sekunden
  // wieder aus. Der Gewinn war ohnehin nie belegt, der Schaden schon.
  // Es wird nur noch gelesen, nichts mehr gesetzt.

  // Geht der Track von sich aus zu Ende (Anruf, Kamera von einer
  // anderen App übernommen, Systemfehler), soll das dastehen und nicht
  // als schwarzes Bild rätselhaft bleiben.
  track.addEventListener("ended", () => {
    if (!scanning) return;
    stopScan();
    setStatus("Die Kamera wurde vom System beendet. Noch einmal starten.");
  }, { once: true });

  const ist = track.getSettings ? track.getSettings() : {};
  const name = (track.label || "").replace(/^Back\s*/i, "").trim();
  return [ist.width && ist.height ? `${ist.width}×${ist.height}` : "", name]
    .filter(Boolean).join(" · ");
}

/* ---------- Licht ----------
 *
 * Heikel genug für einen eigenen Abschnitt: Der einzige Weg zum
 * Kameralicht führt über applyConstraints auf dem LAUFENDEN Strom – und
 * genau das hat auf iOS schon einmal den Track beendet, die Kamera ging
 * nach zwei Sekunden aus (Commit 708ef08, siehe kameraFeinschliff oben).
 *
 * Der Unterschied zu damals: applyConstraints wird hier nur aufgerufen,
 * wenn das Gerät die Fähigkeit "torch" von sich aus meldet. Meldet es
 * sie nicht, bleibt der Knopf verborgen und der Strom unangetastet –
 * der Fall "wird trotzdem versucht" kann nicht eintreten. WebKit meldet
 * torch derzeit nirgends, auf dem iPhone erscheint der Knopf also nicht.
 * Das ist kein Fehler, sondern die Absicherung, die hier greift.
 */

let lichtAn = false;

function lichtTrack() {
  return videoEl.srcObject?.getVideoTracks?.()[0] || null;
}

/** Meldet das Gerät ein schaltbares Licht? */
function lichtVerfuegbar(track) {
  try {
    return !!track?.getCapabilities?.().torch;
  } catch {
    // getCapabilities gibt es nicht auf jedem Gerät. Das ist kein
    // Fehler, sondern schlicht "kein Licht".
    return false;
  }
}

function beschrifteLicht() {
  torchBtn.textContent = lichtAn ? "Licht aus" : "Licht an";
  torchBtn.setAttribute("aria-pressed", lichtAn ? "true" : "false");
}

/** Nach jedem Kamerastart: Knopf zeigen, wenn es etwas zu schalten gibt. */
function lichtAnbieten() {
  // Ein neuer Strom startet immer mit ausgeschaltetem Licht.
  lichtAn = false;
  const verfuegbar = lichtVerfuegbar(lichtTrack());
  torchBtn.hidden = !verfuegbar;
  if (verfuegbar) beschrifteLicht();
}

async function toggleLicht() {
  const track = lichtTrack();
  if (!lichtVerfuegbar(track)) return;

  const ziel = !lichtAn;
  try {
    await track.applyConstraints({ advanced: [{ torch: ziel }] });
    lichtAn = ziel;
    beschrifteLicht();
  } catch (e) {
    // Nicht stumm scheitern: sonst drückt der Nutzer weiter und nichts
    // passiert. Knopf weg, Grund hinschreiben.
    torchBtn.hidden = true;
    lichtAn = false;
    setStatus("Das Licht lässt sich an diesem Gerät nicht schalten.", { active: true });
  }
}

/** Gemerkte Kamera; überlebt den Neustart der App. */
const KAMERA_SPEICHER = "pr_kamera";

function gemerkteKamera() {
  try { return localStorage.getItem(KAMERA_SPEICHER) || ""; } catch { return ""; }
}
function merkeKamera(id) {
  try { id ? localStorage.setItem(KAMERA_SPEICHER, id) : localStorage.removeItem(KAMERA_SPEICHER); } catch { /* egal */ }
}

/**
 * Nur Rückkameras, und die Dual Wide zuerst.
 *
 * Ein Telefon meldet Front-, Ultraweitwinkel-, Tele- und mehrere
 * zusammengesetzte Kameras. Zum Scannen einer Plattenhülle taugt davon
 * genau eine Sorte, und in der Praxis hat die "Back Dual Wide Camera"
 * am zuverlässigsten funktioniert. Der Rest steht nur im Weg – wer aus
 * Versehen die Frontkamera wählt, filmt sich selbst.
 *
 * Vor der ersten Freigabe liefert iOS keine Bezeichnungen. Dann bleibt
 * die Liste ungefiltert, sonst wäre sie leer.
 */
function nurRueckkameras(cams) {
  const mitNamen = cams.filter((d) => (d.label || "").trim() !== "");
  if (mitNamen.length === 0) return cams;

  const rueck = mitNamen.filter((d) => /back|rück|rear/i.test(d.label));
  const auswahl = rueck.length > 0 ? rueck : mitNamen;

  // Dual Wide nach vorn, danach die einfache Rückkamera, dann der Rest.
  const rang = (d) => {
    const l = d.label.toLowerCase();
    if (l.includes("dual wide")) return 0;
    if (l.includes("triple") || l.includes("dual")) return 1;
    if (l.includes("ultra") || l.includes("tele")) return 3;
    return 2;
  };
  return [...auswahl].sort((a, b) => rang(a) - rang(b));
}

async function refreshCameraList(selectedId) {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = nurRueckkameras(devices.filter((d) => d.kind === "videoinput"));
    if (cams.length === 0) {
      cameraSelect.hidden = true;
      cameraSelect.innerHTML = "";
      return;
    }

    cameraSelect.innerHTML = cams
      .map((d, i) => `<option value="${escapeHtml(d.deviceId)}">${escapeHtml(d.label || "Kamera " + (i + 1))}</option>`)
      .join("");

    // Reihenfolge: was gerade läuft, sonst das Gemerkte, sonst die
    // erste – und die ist nach der Sortierung oben die Dual Wide.
    const gemerkt = gemerkteKamera();
    const wunsch = [selectedId, gemerkt].find((id) => id && cams.some((c) => c.deviceId === id));
    cameraSelect.value = wunsch || cams[0].deviceId;
    merkeKamera(cameraSelect.value);

    // Bei nur einer Kamera gibt es nichts zu wählen – dann weg damit.
    cameraSelect.hidden = cams.length < 2;
  } catch {
    // Kein Zugriff auf enumerateDevices (z. B. kein https) – dann bleibt es
    // bei der Standardkamera, kein Grund den Scan abzubrechen.
  }
}

cameraSelect.addEventListener("change", () => {
  merkeKamera(cameraSelect.value);
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
    codeReader = makeCodeReader();
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
    letzteLesung = null;
    scanControls = await codeReader.decodeFromConstraints({ video: videoConstraints() }, videoEl, (result) => {
      if (!result) return;
      const gelesen = pruefeLesung(result.getText());
      if (!gelesen) return;
      setStatus("Erkannt: " + gelesen);
      lookupBarcode(gelesen);
      stopScan();
    });

    const kamera = kameraFeinschliff();
    lichtAnbieten();
    await refreshCameraList(cameraSelect.value || undefined);
    setStatus(`Barcode aus etwa 20 cm anvisieren${kamera ? " · " + kamera : ""}`, { active: true });
  } catch (e) {
    scanning = false;
    frameEl.classList.remove("live");
    scanBtn.textContent = "Barcode-Scan starten";
    setStatus("Kamera-Zugriff fehlgeschlagen: " + e.message);
  }
}

function stopScan() {
  letzteLesung = null;
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
  // Der Knopf gehört zum laufenden Strom: ohne Kamera nichts zu schalten.
  torchBtn.hidden = true;
  lichtAn = false;
  scanBtn.textContent = mode === "barcode" ? "Barcode-Scan starten" : "Kamera starten";
}

// Kamera freigeben, wenn die Seite verlassen oder in den Hintergrund geschoben wird.
window.addEventListener("pagehide", stopScan);
/*
 * Kamera freigeben, wenn die Seite wirklich in den Hintergrund geht.
 *
 * Nicht sofort: iOS meldet die Seite auch kurz als verborgen, während
 * die Systemabfrage nach der Kamerafreigabe darüberliegt oder die
 * Ansicht wechselt. Ein sofortiges stopScan() hätte die Kamera dann
 * gleich nach dem Einschalten wieder abgeschaltet. Deshalb erst
 * nachsehen, ob sie eine halbe Sekunde später immer noch verborgen ist.
 */
let verborgenTimer = null;
document.addEventListener("visibilitychange", () => {
  clearTimeout(verborgenTimer);
  if (!document.hidden) return;
  verborgenTimer = setTimeout(() => {
    if (document.hidden && (scanning || coverStream)) stopScan();
  }, 500);
});

/* ---------- Cover-Foto ---------- */

async function startCoverCamera() {
  try {
    if (coverStream) coverStream.getTracks().forEach((t) => t.stop());
    coverStream = await navigator.mediaDevices.getUserMedia({
      video: videoConstraints(),
    });
    videoEl.srcObject = coverStream;
    frameEl.classList.add("live");
    scanning = true;
    scanBtn.textContent = "Kamera stoppen";
    captureBtn.hidden = false;
    const kamera = kameraFeinschliff();
    lichtAnbieten();
    setStatus(`Cover gut ausgeleuchtet in den Rahmen halten, dann „Foto aufnehmen“.${kamera ? " · " + kamera : ""}`, { active: true });
    await refreshCameraList(cameraSelect.value || undefined);
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
/**
 * Fortschritt der Texterkennung anzeigen.
 *
 * Nötig, weil der erste Cover-Scan die Sprachdaten deu+eng (rund 30 MB)
 * vom CDN nachlädt. Ohne Rückmeldung stand minutenlang unverändert
 * "Text auf dem Cover wird gelesen …" da – im Mobilnetz nicht von einem
 * Absturz zu unterscheiden. Ab dem zweiten Mal liegen die Daten in
 * IndexedDB und die Ladephasen fallen weg.
 */
function coverFortschritt(m) {
  const phase = {
    "loading tesseract core": "Texterkennung wird geladen",
    "loading language traineddata": "Sprachdaten werden geladen (einmalig, rund 30 MB)",
    "initializing tesseract": "Texterkennung wird vorbereitet",
    "initializing api": "Texterkennung wird vorbereitet",
    "recognizing text": "Text auf dem Cover wird gelesen",
  }[m.status];
  // Unbekannte Zwischenmeldungen von tesseract.js nicht anzeigen: sie
  // sind englisch, technisch und wechseln je nach Version.
  if (!phase) return;
  const prozent = m.progress > 0 ? ` ${Math.round(m.progress * 100)} %` : "";
  setStatus(`${phase} …${prozent}`, { active: true, busy: true });
}

async function captureCoverPhoto() {
  if (!coverStream) return;

  // Ohne Bilddaten gibt es nichts zu erkennen.
  //
  // videoWidth bleibt 0, solange der Strom noch keine Metadaten geliefert
  // hat – auf iOS direkt nach dem Kamerastart regelmäßig der Fall. Ohne
  // diese Prüfung entstand eine 0x0-Fläche: drawImage lief ins Leere,
  // Bild- und Texterkennung bekamen ein leeres Bild und meldeten brav
  // "nichts erkannt". Von außen sah das aus, als sei das Cover nicht
  // lesbar, dabei war nie eines aufgenommen worden.
  if (!videoEl.videoWidth || !videoEl.videoHeight) {
    setStatus("Die Kamera liefert noch kein Bild. Kurz warten, dann erneut auslösen.", { active: true });
    return;
  }

  captureBtn.disabled = true;

  const canvas = document.createElement("canvas");
  canvas.width = videoEl.videoWidth;
  canvas.height = videoEl.videoHeight;
  canvas.getContext("2d").drawImage(videoEl, 0, 0);

  let guess = "";
  let fehler = "";

  // Stufe 1: das Bild wiedererkennen lassen. Schlägt fehl oder ist der
  // Weg nicht eingerichtet, kommt unten die Texterkennung.
  setStatus("Cover wird bestimmt …", { active: true, busy: true });
  const erkannt = await coverErkennen(canvas);
  guess = coverSuchtext(erkannt);

  // Ein wiedererkanntes Cover ist sicher genug, um direkt zu suchen.
  // Bisher musste nach dem Foto noch einmal gedrückt werden – wer die
  // Kamera nur draufhielt, löste damit gar keine Abfrage aus.
  if (guess) {
    captureBtn.disabled = false;
    setStatus("");
    lookupCoverText(guess);
    return;
  }

  // Stufe 2: Texterkennung im Browser.
  setStatus("Text auf dem Cover wird gelesen …", { active: true, busy: true });
  try {
    // Worker, WASM-Kern UND Sprachdaten liegen lokal (app/vendor).
    // Ohne diese drei Pfade holt tesseract.js alles zur Laufzeit vom CDN
    // – und genau daran ist die Texterkennung auf dem iPhone gescheitert:
    // im WKWebView schlug der Abruf der Sprachdaten mit "NetworkError:
    // Load failed" fehl, und zwar bei jedem Cover gleichermaßen.
    //
    // Dass es dafür keine 30 MB braucht, war die eigentliche Erkenntnis:
    // die Fast-Modelle von deu+eng wiegen zusammen 2,7 MB und reichen für
    // ein paar große Wörter auf einer Plattenhülle allemal.
    const { data } = await Tesseract.recognize(canvas, "deu+eng", {
      workerPath: "./vendor/tesseract-worker.min.js",
      corePath: "./vendor/tesseract-core/",
      langPath: "./vendor/tessdata/",
      logger: coverFortschritt,
    });
    guess = (data.text || "")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length >= 3 && /[a-zA-ZäöüÄÖÜ]/.test(l))
      .slice(0, 2)
      .join(" ");
  } catch (e) {
    // Nur merken, nicht anzeigen: das setStatus() am Ende hat die
    // Meldung hier früher unmittelbar wieder gelöscht, und der Nutzer
    // stand vor einem leeren Formular ohne Grund.
    fehler = "Texterkennung fehlgeschlagen – Text von Hand eintragen.";
  }

  captureBtn.disabled = false;
  setStatus(fehler, { active: !!fehler });
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
    const res = await discogsSuche({ q: text });
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

/* ---------- Leser-Einstellungen ---------- */

/*
 * Zahlenwerte statt Namen, weil das Browser-Bündel von ZXing
 * DecodeHintType nicht exportiert – BarcodeFormat dagegen schon. Die
 * Werte stammen aus der Aufzählung der Bibliothek und sind im Bündel
 * nachgesehen: POSSIBLE_FORMATS = 2, TRY_HARDER = 3. Sollten sie sich
 * je ändern, schlägt test/scanner-decode.test.html an: dort wird
 * geprüft, dass ein Code 39 NICHT mehr gelesen wird.
 */
const HINT_POSSIBLE_FORMATS = 2;
const HINT_TRY_HARDER = 3;

/**
 * Auf Produktbarcodes einschränken.
 *
 * Ohne Vorgabe probiert der 1D-Leser auch Code 39, Codabar und
 * Interleaved 2 of 5 durch. Gerade ITF ist berüchtigt dafür, aus
 * beliebigen Streifenmustern plausible Ziffern zu lesen – auf einer
 * CD-Hülle gibt es davon reichlich: Ränder, Spiegelungen, Textzeilen,
 * das Booklet dahinter. Herausgekommen sind Zahlen, die mit dem
 * aufgedruckten Code nichts zu tun hatten.
 *
 * EAN-13, EAN-8, UPC-A und UPC-E decken jeden Handelsartikel ab. Alles
 * andere kann auf einer Platte oder CD nicht der gesuchte Code sein.
 *
 * TRY_HARDER wird bewusst NICHT gesetzt. Es lässt ZXing jedes Bild
 * zusätzlich gedreht durchrechnen – auf dem Telefon je Versuch ein
 * schwerer Brocken auf demselben Thread, der auch das Vorschaubild
 * zeichnet. Die Kamera wirkte damit, als ginge sie gar nicht an.
 */
function scanHints() {
  const F = ZXingBrowser.BarcodeFormat;
  const hints = new Map();
  hints.set(HINT_POSSIBLE_FORMATS, [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E]);
  return hints;
}

/**
 * Leser bauen. Schlägt das Einschränken aus irgendeinem Grund fehl,
 * lieber ohne Vorgabe weiterscannen als gar nicht: eine Verfeinerung
 * darf das Kernstück der App nie lahmlegen.
 */
function makeCodeReader() {
  try {
    return new ZXingBrowser.BrowserMultiFormatOneDReader(scanHints(), { delayBetweenScanAttempts: 200 });
  } catch (e) {
    return new ZXingBrowser.BrowserMultiFormatOneDReader();
  }
}

/* ---------- Lesungen absichern ---------- */

/** Zuletzt gelesener Code, der noch auf seine Bestätigung wartet. */
let letzteLesung = null;

/**
 * Eine einzelne Lesung genügt nicht.
 *
 * Belegt an einem echten Fall: auf einer Hülle mit aufgedrucktem
 * 724352306428 kam 4601294548122 heraus – 13 Ziffern, Prüfziffer
 * korrekt, russischer Präfix. Die Prüfziffer allein fängt so etwas
 * nicht ab: sie hat nur zehn mögliche Werte, jede zehnte Fehllesung
 * besteht sie zufällig.
 *
 * Zwei aufeinanderfolgende gleiche Lesungen sind dagegen praktisch
 * nicht zufällig zu haben. Bei 200 ms zwischen den Versuchen kostet das
 * eine Fünftelsekunde – deutlich weniger, als eine falsche Platte in der
 * Sammlung später kostet.
 *
 * Gibt den bestätigten Code zurück oder null, solange noch nicht.
 */
function pruefeLesung(roh) {
  const code = normalizeBarcode(roh);

  // Was die Prüfziffer nicht besteht, ist sicher falsch – gar nicht erst
  // als Kandidat merken.
  if (!eanPruefzifferStimmt(code)) {
    letzteLesung = null;
    return null;
  }

  if (code !== letzteLesung) {
    letzteLesung = code;
    setStatus("Code gefunden, wird bestätigt …", { active: true, busy: true });
    return null;
  }

  letzteLesung = null;
  return code;
}

/* ---------- Barcode von Hand ---------- */

/**
 * Prüfziffer nach GS1. Die letzte Ziffer eines Strichcodes ist aus den
 * übrigen berechenbar – damit fällt ein Tippfehler sofort auf, statt
 * erst als "keine Treffer" zurückzukommen.
 *
 * EAN-13 und UPC-A rechnen von rechts mit dem Gewicht 3 beginnend,
 * EAN-8 ebenso. Von rechts zu zählen deckt alle drei Längen mit
 * derselben Schleife ab.
 */
function eanPruefzifferStimmt(ziffern) {
  const z = normalizeBarcode(ziffern);
  if (![8, 12, 13].includes(z.length)) return false;

  let summe = 0;
  for (let i = z.length - 2; i >= 0; i--) {
    const abstand = z.length - 2 - i;          // 0 = direkt vor der Prüfziffer
    summe += Number(z[i]) * (abstand % 2 === 0 ? 3 : 1);
  }
  return (10 - (summe % 10)) % 10 === Number(z[z.length - 1]);
}

/**
 * Eingabe deuten: Ziffern sind ein Barcode, alles andere ein Suchtext.
 *
 * Der Barcode ist der schnellere Weg, aber er trägt nicht immer. Bei
 * Depeche Modes "Speak & Spell" führt der aufgedruckte Code bei Discogs
 * zu 315 fremden Platten, und alles vor etwa 1980 hat überhaupt keinen
 * Barcode. Für beide Fälle braucht es die Suche nach Interpret und
 * Titel – im selben Feld, damit man nicht erst überlegen muss, welches
 * das richtige ist.
 *
 * Gibt { code } oder { text } zurück, sonst { fehler }.
 */
function pruefeEingabe(eingabe) {
  const roh = String(eingabe || "").trim();
  if (roh === "") return { fehler: "Barcode eintippen oder nach Interpret und Titel suchen." };

  // Enthält es Buchstaben, ist es kein Barcode – dann Textsuche.
  if (/[^\d\s\-]/.test(roh)) {
    if (roh.length < 3) return { fehler: "Für die Suche bitte mindestens drei Zeichen." };
    return { text: roh };
  }

  const z = normalizeBarcode(roh);
  if (![8, 12, 13].includes(z.length)) {
    return { fehler: `Ein Barcode hat 8, 12 oder 13 Ziffern – das waren ${z.length}. Für eine Titelsuche Buchstaben eingeben.` };
  }
  return { code: z, warnung: eanPruefzifferStimmt(z) ? "" : "Die Prüfziffer passt nicht. Vertippt? Gesucht wird trotzdem." };
}

if (codeInput) {
  // Mitzählen beim Tippen: der Fehler war zuletzt eine ausgelassene
  // Ziffer, und den sieht man an einer Zahlenreihe nicht.
  codeInput.addEventListener("input", () => {
    const fehlerEl = document.getElementById("code-error");
    const roh = codeInput.value.trim();
    // Bei Buchstaben ist es eine Titelsuche – da gibt es nichts zu zählen.
    if (roh === "" || /[^\d\s\-]/.test(roh)) { fehlerEl.textContent = ""; return; }
    const n = normalizeBarcode(roh).length;
    fehlerEl.textContent = [8, 12, 13].includes(n)
      ? `${n} Ziffern – passt.`
      : `${n} Ziffern – ein Barcode hat 8, 12 oder 13.`;
  });
}

if (codeForm) {
  codeForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const fehlerEl = document.getElementById("code-error");
    const { code, text, fehler, warnung } = pruefeEingabe(codeInput.value);
    fehlerEl.textContent = fehler || warnung || "";
    if (!code && !text) return;

    // Läuft durch denselben Weg wie ein Scan: Kontingent, Katalog,
    // Discogs, Abgleich. Nur die Eingabe kommt woanders her.
    if (scanning) stopScan();
    codeInput.blur();
    if (code) lookupBarcode(code);
    else lookupCoverText(text);
  });
}

/* ---------- Selbsttest ---------- */

const selftestBtn = document.getElementById("selftest-btn");
if (selftestBtn) {
  selftestBtn.addEventListener("click", async () => {
    const ziel = document.getElementById("selftest-out");
    selftestBtn.disabled = true;
    ziel.innerHTML = `<p class="note"><span class="spinner"></span>Selbsttest läuft …</p>`;
    const fertig = await selftestAusfuehren((teil) => {
      ziel.innerHTML = selftestMarkup(teil, true);
    });
    ziel.innerHTML = selftestMarkup(fertig, false);
    selftestBtn.disabled = false;
  });
}

/* ---------- Barcode-Abgleich ---------- */

/**
 * Discogs' barcode=-Suche ist KEINE exakte Suche.
 *
 * Nachgemessen: der frei erfundene Code 9999999999999 liefert 14
 * Treffer – Black Eyed Peas, Sampler, alles Mögliche. Steht eine CD
 * nicht in der Datenbank, kam also nicht "keine Treffer" zurück,
 * sondern ein Stapel fremder Platten. Bei genau einem solchen
 * Zufallstreffer sprang die App sogar direkt aufs Ergebnis und
 * präsentierte eine wildfremde Platte als DIE Antwort.
 *
 * Der Suchtreffer trägt aber selbst ein barcode-Feld. Wir können also
 * nachprüfen, ohne eine einzige zusätzliche Anfrage zu stellen.
 */

/** Nur Ziffern: Discogs schreibt denselben Code mal "724385522925",
    mal "7 24385 52292 5". */
function normalizeBarcode(value) {
  return String(value ?? "").replace(/\D/g, "");
}

/**
 * Ein EAN-13 mit führender Null und der 12-stellige UPC-A darauf sind
 * derselbe Code. Der Scanner liefert je nach Aufdruck mal das eine, mal
 * das andere, Discogs speichert mal so, mal so.
 */
function barcodeVariants(code) {
  const ziffern = normalizeBarcode(code);
  const varianten = new Set();
  if (!ziffern) return [];
  varianten.add(ziffern);
  if (ziffern.length === 13 && ziffern.startsWith("0")) varianten.add(ziffern.slice(1));
  if (ziffern.length === 12) varianten.add("0" + ziffern);
  return [...varianten];
}

/** Trägt dieser Treffer wirklich den gescannten Barcode? */
function resultHasBarcode(result, code) {
  const gesucht = new Set(barcodeVariants(code));
  if (gesucht.size === 0) return false;
  return (result.barcode || []).some((b) => gesucht.has(normalizeBarcode(b)));
}

/**
 * Taugt dieser Barcode überhaupt zur Identifikation?
 *
 * Ein Barcode gehört zu genau einer Veröffentlichung. Wenn die Treffer
 * dazu über viele verschiedene Interpreten streuen, ist der Code in
 * Discogs mehrfach falsch vergeben – dann kann keine Auswahl richtig
 * sein, und eine Liste fremder Platten anzuzeigen ist schlechter als
 * ehrlich zu sagen, dass es nicht geht.
 *
 * Nachgemessen an echten Fällen (erste Ergebnisseite):
 *   724352306428 (Depeche Mode, Speak & Spell)  38 Interpreten in 50
 *                Treffern, häufigster 14 % – in Discogs bei 315
 *                fremden Platten eingetragen, die richtige ist nicht
 *                darunter.
 *   724385522925 (Radiohead, OK Computer)        1 Interpret, 100 %
 *   008811078522 (B. Brown Posse)                1 Interpret, 100 %
 *
 * Unter fünf Treffern greift die Regel nicht: dort ist Streuung normal
 * und die Stichprobe zu klein.
 */
function barcodeIstVerlaesslich(results) {
  if (results.length < 5) return true;

  const proInterpret = new Map();
  for (const r of results) {
    const name = String(r.artist || "").trim().toLowerCase();
    proInterpret.set(name, (proInterpret.get(name) || 0) + 1);
  }
  const groesste = Math.max(...proInterpret.values());
  return groesste / results.length >= 0.5;
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
    barcode: barcode ? normalizeBarcode(barcode) : null,
    cover_url: r.cover_image || r.thumb || null,
    // Der Suchtreffer bringt das alles schon mit – es kostet nichts,
    // den Katalog gleich damit zu füllen.
    label: (r.label || [])[0] || null,
    catalog_no: r.catno || null,
    genres: (r.genre || []).length ? r.genre : null,
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
    // null = Tabelle fehlt; dann gibt es keinen Stand zum Anzeigen.
    scanQuota = { used: used || 0, subscribed, known: used !== null };
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

  // Ungezählt: die Tabelle fehlt. Durchlassen, aber keine Zahl anzeigen,
  // die es nicht gibt.
  if (result.ungezaehlt) {
    scanQuota.known = false;
    paintScanQuota();
    return true;
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

  // Zuerst der gemeinsame Katalog. Kennt ihn schon jemand, ist die Platte
  // sofort da und Discogs bleibt ungefragt – genau dafür gibt es ihn.
  // Auf einer Plattenbörse, wo sich viele dieselbe WLAN-IP und damit
  // dasselbe 25-pro-Minute-Limit teilen, ist das der Unterschied.
  const ausKatalog = await fetchReleasesByBarcode(barcode).catch(() => []);
  if (ausKatalog.length > 0) {
    hideRateLimitNotice();
    await showScan(barcode, ausKatalog.map((r) => releaseToItem(r, barcode)), collectionByBarcode, "Katalog");
    return;
  }

  try {
    const res = await discogsSuche({ barcode });

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

    // Erst die Zufallstreffer aussortieren, dann kappen – sonst fallen
    // echte Treffer hinten aus der Liste, weil vorne Fremdes steht.
    const roh = data.results || [];
    const echte = roh.filter((r) => resultHasBarcode(r, barcode));
    // Erst alle umwandeln, dann kappen: die Verlässlichkeitsprüfung
    // unten soll die ganze Ergebnisseite sehen, nicht nur die acht,
    // die angezeigt werden – größere Stichprobe, klareres Bild.
    const alle = echte.map((r) => normalizeResult(r, barcode));
    const results = alle.slice(0, 8);
    // Was der Abgleich aussortiert hat, bleibt erreichbar. Ein Filter,
    // der Dinge spurlos verschwinden lässt, ist schlimmer als keiner:
    // liegt er daneben, steht der Nutzer ohne Weg da.
    currentScan.aussortiert = roh
      .filter((r) => !resultHasBarcode(r, barcode))
      .slice(0, 8)
      .map((r) => normalizeResult(r, barcode));

    // Discogs hat geantwortet, aber nichts davon trägt diesen Barcode:
    // das ist "nicht gefunden", nicht "hier ist deine Platte".
    currentScan.verworfen = roh.length - echte.length;

    // Streuen die Treffer über viele Interpreten, ist der Barcode in
    // Discogs mehrfach vergeben und taugt nicht zur Identifikation.
    if (barcode && !barcodeIstVerlaesslich(alle)) {
      currentScan = { barcode, results, quelle: "Discogs", verworfen: currentScan.verworfen, statusData: emptyScanStatusData() };
      resultsCard.style.display = "block";
      renderUnreliableBarcode(barcode, results);
      setStatus("");
      return;
    }

    await showScan(barcode, results, collectionByBarcode);

    // Nebenher den Katalog füllen, damit der nächste Scan derselben
    // Platte ohne Discogs auskommt. Ohne await: das Ergebnis steht
    // bereits, darauf soll niemand warten.
    katalogLaeuft = katalogFuellen(results);
  } catch (e) {
    setStatus("Discogs-Suche fehlgeschlagen: " + e.message);
  }
}

/**
 * Trefferzahl entscheidet über die Ansicht: einer geht direkt aufs
 * Ergebnis, mehrere in die Auswahl, keiner in den Hinweis.
 */
async function showScan(barcode, results, collectionByBarcodePromise, quelle = "Discogs") {
  const ids = results.map((r) => r.discogs_id);

  // Die restlichen Statusdaten hängen an der discogs_id und können erst
  // jetzt geholt werden – eine Sammelabfrage für alle Treffer zusammen.
  const [byBarcode, byId, wished] = await Promise.all([
    collectionByBarcodePromise,
    fetchCollectionByDiscogsIds(ids).catch(() => []),
    fetchWishlistByDiscogsIds(ids).catch(() => []),
  ]);

  const verworfen = currentScan.verworfen || 0;
  const aussortiert = currentScan.aussortiert || [];
  currentScan = {
    barcode,
    results,
    quelle,
    verworfen,
    aussortiert,
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
      // Discogs hat geantwortet, aber nichts trug den Barcode: eine
      // andere Geschichte als "kennt nichts". Der Nutzer soll nicht
      // denken, die App habe den Scan verschluckt.
      text: !barcode
        ? "Discogs kennt dazu nichts. Text anpassen oder manuell anlegen."
        : currentScan.verworfen > 0
          ? `Zu Barcode ${barcode} gibt es bei Discogs keine passende Veröffentlichung. ` +
            `${currentScan.verworfen} ähnliche Einträge wurden aussortiert – ihr Barcode ist ein anderer.`
          : `Zu Barcode ${barcode} kennt Discogs keine Veröffentlichung. Bei älteren Platten ohne Barcode hilft die Cover-Suche.`,
    }) +
    (currentScan.verworfen > 0
      ? `<p class="manual-hint"><button type="button" class="linklike" data-action="show-dropped">Die ${currentScan.verworfen} aussortierten Treffer ansehen</button></p>`
      : "") +
    manualHintMarkup();
}

/**
 * Der Barcode ist in Discogs mehrfach vergeben. Kein Treffer kann
 * stimmen – das gehört gesagt, statt eine Auswahl fremder Platten
 * hinzustellen. Die Liste bleibt auf Wunsch trotzdem erreichbar, damit
 * der Weg keine Sackgasse ist.
 */
function renderUnreliableBarcode(barcode, results) {
  const interpreten = new Set(results.map((r) => String(r.artist || "").trim().toLowerCase())).size;
  setResultsHead("Barcode nicht verwertbar", `Barcode ${barcode}`);
  resultsEl.innerHTML = `
    ${emptyState({
      iconName: "alert",
      title: "Dieser Barcode führt zu nichts",
      text: `Discogs hat ihn bei vielen verschiedenen Veröffentlichungen eingetragen – ` +
            `${interpreten} unterschiedliche Interpreten allein auf der ersten Seite. ` +
            `Damit lässt sich die Platte nicht bestimmen. Über das Cover-Foto oder von Hand klappt es.`,
    })}
    <div class="scan-actions">
      <button class="btn-primary" type="button" data-action="manual-open">Manuell anlegen</button>
      <button class="btn-secondary" type="button" data-action="weiter">Weiter scannen</button>
    </div>
    <p class="manual-hint">
      <button type="button" class="linklike" data-action="show-anyway">Treffer trotzdem ansehen</button>
    </p>`;
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
      <button class="btn-secondary" type="button" data-action="weiter">Weiter scannen</button>
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

  // Erst in den gemeinsamen Katalog, dann verknüpfen. Schlägt das fehl,
  // wird trotzdem gespeichert – ein fehlender Katalogeintrag darf
  // niemanden daran hindern, seine Platte einzutragen.
  // Erst abwarten, ob der Katalog gerade ohnehin geschrieben wird –
  // sonst legt ein schneller Tipp denselben Eintrag zweimal an.
  if (katalogLaeuft) {
    try { await katalogLaeuft; } catch { /* ein leerer Katalog hält niemanden auf */ }
  }

  const releaseId = item.release_id || (await upsertRelease(item));

  const { error } = await sb.from("collection_items").insert({
    user_id: currentUser.id,
    release_id: releaseId,
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
      ? "Das Free-Limit ist erreicht. Mit CollectView Plus ist die Sammlung unbegrenzt."
      : "Konnte nicht gespeichert werden: " + error.message);
    return;
  }

  loadRecentlySaved();
  // Direkt weiter: wer ein Regal erfasst, scannt die nächste Platte,
  // nicht den Startknopf.
  weiterScannen(`„${item.title}“ ist in deiner Sammlung.`);
}

/**
 * Ergebnis wegräumen und die Kamera wieder anwerfen. Der Barcode-Scan
 * hält nach jedem Treffer an (sonst liefe die Erkennung endlos weiter);
 * fürs Erfassen eines ganzen Regals muss der Weg zurück in den Sucher
 * aber ein Knopfdruck sein, nicht drei.
 */
function weiterScannen(meldung) {
  resultsCard.style.display = "none";
  currentScan.selected = null;
  if (meldung) setStatus(meldung, { active: true });
  if (!scanning) toggleScan();
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
    weiterScannen(`„${item.title}“ steht auf deiner Wunschliste.`);
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
  if (action === "weiter") weiterScannen("");
  if (action === "show-anyway") renderResultList();
  if (action === "show-dropped") {
    // Ausdrücklich gewollt: der Abgleich kann danebenliegen, etwa wenn
    // ein Discogs-Eintrag gar keinen Barcode hinterlegt hat.
    currentScan.results = currentScan.aussortiert;
    renderResultList();
  }
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
  torchBtn.addEventListener("click", toggleLicht);
  loadRecentlySaved();
  refreshScanQuota();
}

init();
