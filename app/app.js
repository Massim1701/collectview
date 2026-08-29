const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let codeReader = null;
let scanControls = null;
let scanning = false;

// ---------- Auth ----------

async function signUp() {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  document.getElementById("auth-error").textContent = "";
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) { document.getElementById("auth-error").textContent = error.message; return; }
  document.getElementById("auth-error").textContent = "Konto erstellt. Falls Bestätigung nötig: E-Mail-Postfach prüfen, dann anmelden.";
}

async function signIn() {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  document.getElementById("auth-error").textContent = "";
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) { document.getElementById("auth-error").textContent = error.message; }
}

async function signOut() {
  await supabase.auth.signOut();
}

supabase.auth.onAuthStateChange((_event, session) => {
  currentUser = session?.user || null;
  renderAuthState();
  loadCollection();
});

function renderAuthState() {
  const loggedOut = document.getElementById("auth-logged-out");
  const loggedIn = document.getElementById("auth-logged-in");
  const scanCard = document.getElementById("scan-card");
  if (currentUser) {
    loggedOut.style.display = "none";
    loggedIn.style.display = "block";
    scanCard.style.display = "block";
    document.getElementById("user-email").textContent = currentUser.email;
  } else {
    loggedOut.style.display = "block";
    loggedIn.style.display = "none";
    scanCard.style.display = "none";
    document.getElementById("results-card").style.display = "none";
  }
}

// ---------- Barcode scanning (ZXing) ----------

async function toggleScan() {
  const btn = document.getElementById("scan-btn");
  const video = document.getElementById("video");
  const status = document.getElementById("scan-status");

  if (scanning) {
    stopScan();
    return;
  }

  try {
    codeReader = new ZXingBrowser.BrowserMultiFormatReader();
    video.style.display = "block";
    scanning = true;
    btn.textContent = "Scan stoppen";
    status.textContent = "Kamera wird gestartet …";

    const devices = await ZXingBrowser.BrowserCodeReader.listVideoInputDevices();
    const deviceId = devices[devices.length - 1]?.deviceId; // meist die Rückkamera zuletzt

    scanControls = await codeReader.decodeFromVideoDevice(deviceId, video, (result, err) => {
      if (result) {
        status.textContent = "Erkannt: " + result.getText();
        lookupBarcode(result.getText());
        stopScan();
      }
    });
    status.textContent = "Barcode im Bild positionieren …";
  } catch (e) {
    status.textContent = "Kamera-Zugriff fehlgeschlagen: " + e.message;
    scanning = false;
    btn.textContent = "Barcode-Scan starten";
  }
}

function stopScan() {
  if (scanControls) { scanControls.stop(); scanControls = null; }
  scanning = false;
  document.getElementById("video").style.display = "none";
  document.getElementById("scan-btn").textContent = "Barcode-Scan starten";
}

// ---------- Discogs lookup ----------

async function lookupBarcode(barcode) {
  const status = document.getElementById("scan-status");
  status.textContent = "Suche bei Discogs …";
  try {
    const res = await fetch(`https://api.discogs.com/database/search?barcode=${encodeURIComponent(barcode)}&type=release`);
    const data = await res.json();
    renderResults(data.results || [], barcode);
  } catch (e) {
    status.textContent = "Discogs-Suche fehlgeschlagen: " + e.message;
  }
}

function renderResults(results, barcode) {
  const card = document.getElementById("results-card");
  const list = document.getElementById("results");
  list.innerHTML = "";

  if (results.length === 0) {
    list.innerHTML = `<div class="muted">Keine Treffer für Barcode ${barcode}.</div>`;
    card.style.display = "block";
    return;
  }

  results.slice(0, 8).forEach((r) => {
    const [artist, title] = splitTitle(r.title);
    const el = document.createElement("div");
    el.className = "result-card";
    el.innerHTML = `
      <img src="${r.cover_image || r.thumb || ""}" onerror="this.style.visibility='hidden'">
      <div style="flex:1;">
        <div style="font-weight:700;">${escapeHtml(title)}</div>
        <div class="muted">${escapeHtml(artist)} · ${escapeHtml((r.format || []).join(", "))} · ${r.year || "?"} · ${r.country || "?"}</div>
      </div>
    `;
    el.onclick = () => addToCollection(r, artist, title, barcode);
    list.appendChild(el);
  });

  card.style.display = "block";
}

function splitTitle(fullTitle) {
  const idx = fullTitle.indexOf(" - ");
  if (idx === -1) return ["", fullTitle];
  return [fullTitle.slice(0, idx), fullTitle.slice(idx + 3)];
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------- Collection (Supabase) ----------

async function addToCollection(discogsResult, artist, title, barcode) {
  if (!currentUser) return;
  const { error } = await supabase.from("collection_items").insert({
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
    alert("Konnte nicht gespeichert werden: " + error.message);
    return;
  }
  document.getElementById("results-card").style.display = "none";
  loadCollection();
}

async function loadCollection() {
  const el = document.getElementById("collection");
  const badge = document.getElementById("count-badge");
  if (!currentUser) {
    el.innerHTML = `<div class="muted">Melde dich an, um deine Sammlung zu sehen.</div>`;
    badge.textContent = "";
    return;
  }
  const { data, error } = await supabase
    .from("collection_items")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    el.innerHTML = `<div class="err">${escapeHtml(error.message)}</div>`;
    return;
  }

  badge.textContent = `(${data.length})`;
  if (data.length === 0) {
    el.innerHTML = `<div class="muted">Noch nichts gescannt.</div>`;
    return;
  }

  el.innerHTML = data.map((item) => `
    <div class="collection-item">
      <img src="${item.cover_url || ""}" onerror="this.style.visibility='hidden'">
      <div>
        <div style="font-weight:700;">${escapeHtml(item.title)}</div>
        <div class="muted">${escapeHtml(item.artist)} · ${escapeHtml(item.format || "")} · ${item.year || "?"}</div>
      </div>
    </div>
  `).join("");
}

renderAuthState();
