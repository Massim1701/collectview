/* =====================================================================
   selftest.js – prüft die Kette hinter dem Scan Glied für Glied.

   Entstanden, weil "der Scanner geht nicht" mehrere völlig verschiedene
   Ursachen haben kann – nicht angemeldet, Tabelle fehlt, Discogs
   unerreichbar, Barcode unbrauchbar – und sich am Telefon keine davon
   von den anderen unterscheiden lässt. Ein Blick statt einer Vermutung.
   ===================================================================== */

/** Testcode mit bekannter Antwort: Radiohead – OK Computer. */
const SELFTEST_BARCODE = "724385522925";

/** Bekannter Text für die Texterkennung. Kurz, groß, ohne Umlaute –
    es soll die Kette geprüft werden, nicht die Grenzen von Tesseract. */
const SELFTEST_OCR_TEXT = "ABBEY ROAD";

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

    ["Cover-Bilder", async () => {
      // Discogs liefert thumb und cover_image ausschließlich an
      // authentifizierte Anfragen. Ohne die Edge Function discogs-suche
      // (die den Token hält) kommen sie leer zurück, und die App zeigt
      // überall nur Platzhalter. Genau das prüft dieser Schritt.
      const res = await discogsSuche({ barcode: SELFTEST_BARCODE });
      if (res.status === 429) throw new Error("Rate-Limit (25 pro Minute und IP)");
      if (!res.ok) throw new Error("HTTP " + res.status);
      const daten = await res.json();
      const mitBild = (daten.results || []).filter((r) => r.cover_image);
      if (mitBild.length === 0) {
        throw new Error("keine Bild-URLs – läuft die Edge Function discogs-suche mit DISCOGS_TOKEN?");
      }
      return `${mitBild.length} Treffer mit Bild`;
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

    ["Bilderkennung", async () => {
      // Absichtlich mit leerem Rumpf: die Funktion antwortet darauf mit
      // 400, OHNE eine (abrechnungsrelevante) Vision-Anfrage zu stellen.
      // Das genügt, um "nicht deployt", "kein Schlüssel" und "bereit"
      // auseinanderzuhalten – ein Selbsttest darf nichts kosten.
      const { data } = await sb.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) throw new Error("keine Sitzung");

      const res = await fetch(COVER_PROXY, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: SUPABASE_ANON_KEY,
          "Content-Type": "application/json",
        },
        body: "{}",
      });

      if (res.status === 404) throw new Error("Funktion cover-erkennen ist nicht deployt");
      if (res.status === 503) throw new Error("GOOGLE_VISION_KEY ist nicht gesetzt");
      if (res.status === 400) return "bereit";
      return "antwortet (HTTP " + res.status + ")";
    }],

    ["Texterkennung", async () => {
      if (typeof Tesseract === "undefined") throw new Error("tesseract.js nicht geladen");

      // Bekannter Text auf weißem Grund, große Schrift, kein Rauschen.
      // Scheitert Tesseract schon hier, liegt es nicht am Cover, sondern
      // an der Kette selbst: Sprachdaten nicht geladen, Worker-Pfad
      // falsch, WASM blockiert. Das ist der Unterschied, den man am
      // Telefon sonst nicht sieht.
      const c = document.createElement("canvas");
      c.width = 640; c.height = 160;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, c.width, c.height);
      ctx.fillStyle = "#000000";
      ctx.font = "bold 64px Helvetica, Arial, sans-serif";
      ctx.textBaseline = "middle";
      ctx.fillText(SELFTEST_OCR_TEXT, 24, 80);

      const { data } = await Tesseract.recognize(c, "deu+eng", {
        workerPath: "./vendor/tesseract-worker.min.js",
        corePath: "./vendor/tesseract-core/",
      });

      const gelesen = (data.text || "").replace(/\s+/g, " ").trim();
      if (!gelesen) throw new Error("nichts erkannt – Sprachdaten (rund 30 MB) geladen?");
      if (!gelesen.toUpperCase().includes(SELFTEST_OCR_TEXT)) {
        throw new Error(`las "${gelesen.slice(0, 40)}" statt "${SELFTEST_OCR_TEXT}"`);
      }
      return `"${gelesen.slice(0, 40)}"`;
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
