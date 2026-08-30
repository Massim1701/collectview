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

# Nur SIMD-LSTM: iOS und jeder aktuelle Browser können WebAssembly, die
# reine JS-Rückfallebene (.wasm.js, ~3,9 MB) wird nie gebraucht.
cp node_modules/tesseract.js-core/tesseract-core-simd-lstm.js   app/vendor/tesseract-core/
cp node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm app/vendor/tesseract-core/

cp node_modules/tesseract.js/dist/tesseract.min.js.LICENSE.txt  app/vendor/
cp node_modules/tesseract.js-core/LICENSE                       app/vendor/tesseract-core/LICENSE

echo "app/vendor erneuert: $(du -sh app/vendor | cut -f1)"
