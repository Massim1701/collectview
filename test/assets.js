/* =====================================================================
   assets.js – prüft, dass jede Datei existiert, die ausgeliefert wird.

   Entstanden aus zwei Fehlern desselben Typs an einem Tag:

     - app/js/discogs.js stand im <script>-Tag, war aber nicht im Repo.
       HEAD war 47 Minuten lang kaputt, die Seite lud eine 404.
     - tesseract-core-simd-lstm.wasm.js lädt der Worker per
       importScripts. vendor.sh hatte sie als "nie gebraucht"
       ausgeschlossen, und JEDE Cover-Texterkennung schlug fehl.

   Beide sind an 152 Browser-Tests vorbeigelaufen, weil die Logik
   prüfen, nicht das Ausgelieferte. Beide hätte diese Datei in
   Millisekunden gefunden.

   Kein Browser, keine Abhängigkeiten: reines Node auf dem Dateisystem.
   Ein <script>-Tag lässt sich im Browser prüfen, ein importScripts im
   Inneren einer fremden Bibliothek nicht.
   ===================================================================== */

const fs = require("fs");
const path = require("path");

const wurzel = path.resolve(__dirname, "..");
const fehler = [];
const hinweise = [];
let geprueft = 0;

/** Alle Dateien mit dieser Endung unterhalb von verzeichnis. */
function sammle(verzeichnis, endung, treffer = []) {
  const voll = path.join(wurzel, verzeichnis);
  if (!fs.existsSync(voll)) return treffer;
  for (const eintrag of fs.readdirSync(voll, { withFileTypes: true })) {
    const rel = path.join(verzeichnis, eintrag.name);
    if (eintrag.isDirectory()) sammle(rel, endung, treffer);
    else if (eintrag.name.endsWith(endung)) treffer.push(rel);
  }
  return treffer;
}

/**
 * Verweise, die auf eine Datei im Projekt zeigen sollen.
 *
 * Absolute URLs, data:, mailto:, tel: und reine Anker gehören nicht
 * dazu – die zeigen bewusst nach draußen oder nirgendwohin.
 */
function istProjektpfad(ziel) {
  return ziel &&
    !/^(https?:)?\/\//.test(ziel) &&
    !/^(data|mailto|tel|blob|javascript):/.test(ziel) &&
    !ziel.startsWith("#");
}

/** Ein Verweis, aufgelöst relativ zu der Datei, in der er steht. */
function pruefeVerweis(datei, ziel, art) {
  if (!istProjektpfad(ziel)) return;
  const ohneAnker = ziel.split("#")[0].split("?")[0];
  if (!ohneAnker) return;

  geprueft += 1;
  const aufgeloest = path.resolve(wurzel, path.dirname(datei), ohneAnker);
  if (!fs.existsSync(aufgeloest)) {
    fehler.push(`${datei}: ${art} "${ziel}" existiert nicht`);
  }
}

/* ---------- HTML: src= und href= ---------- */

for (const datei of [...sammle("app", ".html"), ...sammle("wireframes", ".html")]) {
  const text = fs.readFileSync(path.join(wurzel, datei), "utf8");
  for (const [, attr, ziel] of text.matchAll(/\b(src|href)="([^"]*)"/g)) {
    pruefeVerweis(datei, ziel, attr);
  }
}

/* ---------- Fremde Bibliotheken gehören nicht ans CDN ----------
   CLAUDE.md ist da eindeutig: Bibliotheken liegen unter app/vendor/.
   Zwei Gründe, beide handfest – ohne Netz fehlte sonst schon der
   Supabase-Client und die App startete gar nicht, und ein CDN-Aufruf
   überträgt die IP jedes Nutzers an einen Dritten.

   Die Regel stand bisher nur in der Doku. wireframes/pricing.html lud
   Supabase trotzdem von jsdelivr – und die Seite ist aus fünf Stellen
   der App heraus verlinkt. */

for (const datei of [...sammle("app", ".html"), ...sammle("wireframes", ".html")]) {
  const text = fs.readFileSync(path.join(wurzel, datei), "utf8");
  for (const [, ziel] of text.matchAll(/<script[^>]+src="((?:https?:)?\/\/[^"]+)"/g)) {
    geprueft += 1;
    fehler.push(`${datei}: lädt ein Skript vom CDN statt aus app/vendor/ – ${ziel}`);
  }
  for (const [, ziel] of text.matchAll(/<link[^>]+href="((?:https?:)?\/\/[^"]+)"/g)) {
    geprueft += 1;
    fehler.push(`${datei}: lädt ein Stylesheet vom CDN statt aus app/vendor/ – ${ziel}`);
  }
}

/* ---------- CSS: url(...) ---------- */

for (const datei of [...sammle("app", ".css"), ...sammle("wireframes", ".css")]) {
  const text = fs.readFileSync(path.join(wurzel, datei), "utf8");
  for (const [, ziel] of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
    pruefeVerweis(datei, ziel, "url()");
  }
}

/* ---------- Laufzeitpfade aus unserem eigenen JS ----------
   workerPath, corePath und langPath tauchen in keinem Tag auf.
   tesseract.js holt sie sonst still vom CDN – im WKWebView schlug
   genau das fehl. */

for (const datei of sammle("app/js", ".js")) {
  const text = fs.readFileSync(path.join(wurzel, datei), "utf8");
  for (const [, schluessel, ziel] of text.matchAll(/(workerPath|corePath|langPath):\s*"([^"]+)"/g)) {
    pruefeVerweis(datei.replace("app/js/", "app/"), ziel, schluessel);
  }
}

/* ---------- Sprachdaten: heißen sie so, wie sie angefordert werden? ----------
   Eigene Prüfung, weil hier zwei Dinge zusammenpassen müssen: die
   Sprachen aus dem recognize()-Aufruf und die Endung, die sich aus
   gzip: true|false ergibt.

   Androids Asset-Verpackung entpackt .gz-Dateien beim Bauen und
   streicht die Endung – deu.traineddata.gz heißt im APK
   deu.traineddata. Die Datei ist also da, nur unter anderem Namen, und
   die Texterkennung schlägt trotzdem fehl. Genau davor schützt das
   hier. */

for (const datei of sammle("app/js", ".js")) {
  const text = fs.readFileSync(path.join(wurzel, datei), "utf8");

  const langPfad = text.match(/langPath:\s*"([^"]+)"/);
  if (!langPfad) continue;

  const gzip = /gzip:\s*true/.test(text);
  const endung = gzip ? ".traineddata.gz" : ".traineddata";

  const sprachen = new Set();
  for (const [, liste] of text.matchAll(/recognize\([^,]+,\s*"([a-z+]+)"/g)) {
    liste.split("+").forEach((l) => sprachen.add(l));
  }

  for (const sprache of sprachen) {
    geprueft += 1;
    const ziel = path.resolve(wurzel, "app", langPfad[1], sprache + endung);
    if (!fs.existsSync(ziel)) {
      fehler.push(
        `${datei}: Texterkennung verlangt "${sprache}${endung}" (gzip: ${gzip}), ` +
        `aber ${path.relative(wurzel, ziel)} fehlt`,
      );
    }
  }
}

/* ---------- Was der Tesseract-Worker selbst nachlädt ----------
   Der Worker entscheidet zur Laufzeit, welche Core-Datei er per
   importScripts holt – abhängig davon, ob das Gerät SIMD kann. Fehlt
   die gewählte Datei, scheitert die Texterkennung vollständig, und zwar
   ohne dass irgendein Tag darauf hinwiese. */

const workerDatei = "app/vendor/tesseract-worker.min.js";
const coreOrdner = "app/vendor/tesseract-core";
if (fs.existsSync(path.join(wurzel, workerDatei))) {
  const text = fs.readFileSync(path.join(wurzel, workerDatei), "utf8");
  const verlangt = [...new Set(
    [...text.matchAll(/tesseract-core[a-zA-Z0-9.-]*\.wasm\.js/g)].map((m) => m[0]),
  )];
  const vorhanden = fs.existsSync(path.join(wurzel, coreOrdner))
    ? fs.readdirSync(path.join(wurzel, coreOrdner))
    : [];

  geprueft += verlangt.length;
  const fehlend = verlangt.filter((n) => !vorhanden.includes(n));

  if (fehlend.length === verlangt.length && verlangt.length > 0) {
    fehler.push(`${coreOrdner}: keine einzige Core-Datei vorhanden, der Worker verlangt ${verlangt.join(", ")}`);
  } else if (fehlend.length > 0) {
    // Kein harter Fehler: die SIMD-Fassung deckt jedes aktuelle Gerät
    // ab. Aber es gehört gesagt, statt es zu vergessen.
    hinweise.push(
      `${coreOrdner}: ${fehlend.length} von ${verlangt.length} Core-Fassungen fehlen ` +
      `(${fehlend.join(", ")}) – Geräte ohne SIMD fielen darauf zurück`,
    );
  }

  // Jede vorhandene .wasm.js braucht ihre .wasm daneben.
  for (const name of vorhanden.filter((n) => n.endsWith(".wasm.js"))) {
    const binaer = name.replace(/\.wasm\.js$/, ".wasm");
    geprueft += 1;
    if (!vorhanden.includes(binaer)) {
      fehler.push(`${coreOrdner}: ${name} ohne zugehörige ${binaer}`);
    }
  }
}

/* ---------- Ausgabe im Format von run.sh ---------- */

for (const h of hinweise) console.log(`HINWEIS\t${h}`);

if (fehler.length === 0) {
  console.log(`PASS\tAlle ${geprueft} verwiesenen Dateien sind vorhanden`);
  process.exit(0);
}
for (const f of fehler) console.log(`FAIL\t${f}`);
process.exit(1);
