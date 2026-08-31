#!/usr/bin/env bash
# Erneuert app/vendor/ aus node_modules.
#
# Warum überhaupt lokal: die App lief vorher gegen jsdelivr und unpkg.
# In der nativen Verpackung heißt das, dass ohne Netz nicht einmal der
# Supabase-Client da ist – die App startet dann gar nicht, nicht einmal
# der Login. Dazu sieht Apple es ungern, wenn ausführbarer Code zur
# Laufzeit von fremden Servern nachgeladen wird.
#
# app/vendor/ ist erzeugt und gehört trotzdem ins Repo: die Web-App soll
# ohne npm lauffähig bleiben (python3 -m http.server genügt weiterhin).
# Nach einem Versionswechsel in package.json dieses Skript laufen lassen.
set -euo pipefail
cd "$(dirname "$0")/.."

[ -d node_modules ] || { echo "node_modules fehlt – erst 'npm install'"; exit 1; }

rm -rf app/vendor
mkdir -p app/vendor/tesseract-core

cp node_modules/@supabase/supabase-js/dist/umd/supabase.js      app/vendor/supabase.js
cp node_modules/@zxing/browser/umd/zxing-browser.min.js         app/vendor/zxing-browser.min.js
cp node_modules/tesseract.js/dist/tesseract.min.js              app/vendor/tesseract.min.js
cp node_modules/tesseract.js/dist/worker.min.js                 app/vendor/tesseract-worker.min.js

# .wasm.js ist keine reine JS-Rückfallebene, sondern die Ladedatei, die
# der Worker per importScripts nachlädt (fehlte hier -> Texterkennung
# scheiterte komplett mit 'failed to load'). Alle drei gehören zusammen.
cp node_modules/tesseract.js-core/tesseract-core-simd-lstm.js      app/vendor/tesseract-core/
cp node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm    app/vendor/tesseract-core/
cp node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js app/vendor/tesseract-core/

# Sprachdaten für die Texterkennung.
#
# Kommen nicht aus node_modules, sondern von dem CDN, das tesseract.js
# sonst zur Laufzeit selbst befragen würde. Genau das ist im WKWebView
# gescheitert ("NetworkError: Load failed"), womit die Cover-Erkennung
# auf dem iPhone bei jedem Cover fehlschlug.
#
# Fast-Modelle statt der Standardmodelle: 2,7 MB gegen 17 MB. Für ein
# paar große Wörter auf einer Plattenhülle reicht das, und es hält das
# App-Bundle klein.
mkdir -p app/vendor/tessdata
for lang in eng deu; do
  curl -sfL "https://tessdata.projectnaptha.com/4.0.0_fast/$lang.traineddata.gz" \
       -o "app/vendor/tessdata/$lang.traineddata.gz"
done

cp node_modules/tesseract.js/dist/tesseract.min.js.LICENSE.txt  app/vendor/
cp node_modules/tesseract.js-core/LICENSE                       app/vendor/tesseract-core/LICENSE

echo "app/vendor erneuert: $(du -sh app/vendor | cut -f1)"
