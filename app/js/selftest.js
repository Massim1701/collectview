/* =====================================================================
   selftest.js – prüft die Kette hinter dem Scan Glied für Glied.

   Entstanden, weil "der Scanner geht nicht" mehrere völlig verschiedene
   Ursachen haben kann – nicht angemeldet, Tabelle fehlt, Discogs
   unerreichbar, Barcode unbrauchbar – und sich am Telefon keine davon
   von den anderen unterscheiden lässt. Ein Blick statt einer Vermutung.
   ===================================================================== */

/** Testcode mit bekannter Antwort: Radiohead – OK Computer. */
const SELFTEST_BARCODE = "724385522925";

/** Ein Schritt: Name, Prüfung. Wirft die Prüfung, gilt sie als fehlgeschlagen. */
function selftestSchritte() {
  return [
    ["Angemeldet", async () => {
      if (!currentUser) throw new Error("keine Sitzung – ohne Anmeldung bricht der Scan still ab");
      return currentUser.email || currentUser.id.slice(0, 8) + "…";
    }],

    ["Supabase erreichbar", async () => {
      const { error } = await sb.from("collection_items").select("id").limit(1);
      if (error) throw new Error(error.message);
      return "antwortet";
    }],

    ["Tabelle scan_events", async () => {
      const { error } = await sb.from("scan_events").select("id").limit(1);
      if (error && /Could not find the table/i.test(error.message)) {
        throw new Error("fehlt – db/scan-limit.sql wurde nie ausgeführt");
      }
      if (error) throw new Error(error.message);
      return "vorhanden";
    }],

    ["Tabelle releases", async () => {
      const { error } = await sb.from("releases").select("id").limit(1);
      if (error && /Could not find the table/i.test(error.message)) {
        throw new Error("fehlt – db/releases.sql wurde nie ausgeführt");
      }
      if (error) throw new Error(error.message);
      return "vorhanden";
    }],

    ["Discogs erreichbar", async () => {
      const res = await fetch(
        `https://api.discogs.com/database/search?barcode=${SELFTEST_BARCODE}&type=release`,
      );
      if (res.status === 429) throw new Error("Rate-Limit (25 pro Minute und IP)");
      if (!res.ok) throw new Error("HTTP " + res.status);
      const daten = await res.json();
      const n = (daten.results || []).length;
      if (n === 0) throw new Error("antwortet, aber ohne Treffer");
      return n + " Treffer auf den Testcode";
    }],

    ["Barcode-Abgleich", async () => {
      const res = await fetch(
        `https://api.discogs.com/database/search?barcode=${SELFTEST_BARCODE}&type=release`,
      );
      const daten = await res.json();
      const roh = daten.results || [];
      const echte = roh.filter((r) => resultHasBarcode(r, SELFTEST_BARCODE));
      if (echte.length === 0) throw new Error(`${roh.length} Treffer, keiner mit passendem Barcode`);
      return `${echte.length} von ${roh.length} passen`;
    }],

    ["Kamera vorhanden", async () => {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("getUserMedia fehlt – kein sicherer Kontext?");
      const geraete = await navigator.mediaDevices.enumerateDevices();
      const kameras = geraete.filter((d) => d.kind === "videoinput");
      if (kameras.length === 0) throw new Error("keine Kamera gemeldet");
      return kameras.length + " Kamera(s)";
    }],

    ["Barcode-Leser", async () => {
      if (typeof ZXingBrowser === "undefined") throw new Error("ZXing nicht geladen");
      if (!ZXingBrowser.BrowserMultiFormatOneDReader) throw new Error("1D-Leser fehlt");
      const hints = scanHints();
      return "bereit, " + hints.get(HINT_POSSIBLE_FORMATS).length + " Formate";
    }],
  ];
}

/** Läuft alle Schritte und meldet jeden einzeln zurück. */
async function selftestAusfuehren(melde) {
  const ergebnisse = [];
  for (const [name, pruefung] of selftestSchritte()) {
    try {
      const info = await pruefung();
      ergebnisse.push({ name, ok: true, info });
    } catch (e) {
      ergebnisse.push({ name, ok: false, info: (e && e.message) || String(e) });
    }
    if (melde) melde(ergebnisse);
  }
  return ergebnisse;
}

function selftestMarkup(ergebnisse, laeuft) {
  const zeilen = ergebnisse.map((r) => `
    <div class="selftest-row ${r.ok ? "is-ok" : "is-bad"}">
      <span class="selftest-mark">${r.ok ? "✓" : "✗"}</span>
      <span class="selftest-name">${escapeHtml(r.name)}</span>
      <span class="selftest-info">${escapeHtml(r.info)}</span>
    </div>`).join("");
  return zeilen + (laeuft ? `<p class="note"><span class="spinner"></span>läuft …</p>` : "");
}
