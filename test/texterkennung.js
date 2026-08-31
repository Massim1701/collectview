/* =====================================================================
   texterkennung.js – läuft die Texterkennung wirklich?

   Die Kette ist an einem Tag ZWEIMAL gerissen, beide Male unbemerkt bis
   aufs Telefon:

     - tesseract-core-simd-lstm.wasm.js fehlte. Der Worker lädt sie per
       importScripts; vendor.sh hatte sie als "nie gebraucht"
       ausgeschlossen. Jeder Cover-Scan schlug fehl.
     - Die Sprachdaten kamen vom CDN. Im WKWebView scheiterte der Abruf
       mit "NetworkError: Load failed" – die Cover-Erkennung war auf dem
       iPhone von Anfang an tot.

   test/assets.js prüft, ob die Dateien DA sind. Das genügt nicht: sie
   müssen auch zusammenarbeiten. Hier läuft die echte Erkennung auf
   einem echten Bild, mit genau den Dateien aus app/vendor/.

   Warum nicht als Browser-Test: der Runner fährt Chrome mit
   --virtual-time-budget. Die Uhr springt dabei vor, während die
   WASM-Übersetzung echte Rechenzeit braucht – die Erkennung kommt nie
   zum Ende, und der Test hinge ohne Aussage.

   Braucht node_modules. Ohne die überspringt er sich mit Hinweis: die
   Web-App soll laut CLAUDE.md ohne npm install lauffähig bleiben.
   ===================================================================== */

const fs = require("fs");
const path = require("path");

const wurzel = path.resolve(__dirname, "..");
const BILD = path.join(__dirname, "abbey.png");
const ERWARTET = "ABBEY ROAD";

async function main() {
  if (!fs.existsSync(path.join(wurzel, "node_modules/tesseract.js"))) {
    console.log("HINWEIS\tTexterkennung nicht geprüft – node_modules fehlt (npm install)");
    return 0;
  }

  const { createWorker } = require(path.join(wurzel, "node_modules/tesseract.js"));

  let worker;
  try {
    worker = await createWorker("deu+eng", 1, {
      workerPath: path.join(wurzel, "node_modules/tesseract.js/src/worker-script/node/index.js"),
      // Genau die Dateien, die ausgeliefert werden – nicht die aus
      // node_modules. Sonst prüfte der Test etwas anderes als das,
      // was auf dem Telefon landet.
      corePath: path.join(wurzel, "app/vendor/tesseract-core/"),
      langPath: path.join(wurzel, "app/vendor/tessdata/"),
      gzip: false,
      // Sonst legt tesseract.js eine Kopie der Sprachdaten im
      // Arbeitsverzeichnis ab – 5,6 MB, die beim nächsten "git add -A"
      // im Repo landen. Ist einmal passiert.
      cacheMethod: "none",
    });

    const { data } = await worker.recognize(BILD);
    const gelesen = (data.text || "").replace(/\s+/g, " ").trim();

    if (!gelesen) {
      console.log("FAIL\tTexterkennung liest nichts – genau so sah es aus, als die Sprachdaten fehlten");
      return 1;
    }
    if (!gelesen.toUpperCase().includes(ERWARTET)) {
      console.log(`FAIL\tTexterkennung las "${gelesen}" statt "${ERWARTET}"`);
      return 1;
    }
    console.log(`PASS\tTexterkennung liest "${gelesen}" – Kern und Sprachdaten aus app/vendor/ arbeiten zusammen`);
    return 0;
  } catch (e) {
    console.log(`FAIL\tTexterkennung scheiterte: ${e.message}`);
    return 1;
  } finally {
    try { await worker?.terminate(); } catch { /* egal */ }
  }
}

main().then((code) => process.exit(code));
