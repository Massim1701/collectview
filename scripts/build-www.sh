#!/usr/bin/env bash
# Baut www/ für Capacitor: die Web-App unverändert, nur an einem Ort.
#
# Kein Bundler, kein Transpiler – ein Kopiervorgang. Die Seiten laufen
# weiterhin genauso direkt im Browser (python3 -m http.server), www/ ist
# nur das, was in die native App wandert.
#
# app/ und wireframes/ müssen beide mit: app/*.html verweist auf
# ../wireframes/styles.css und ../wireframes/pricing.html – die relative
# Struktur bleibt deshalb erhalten.
set -euo pipefail
cd "$(dirname "$0")/.."

rm -rf www
mkdir -p www
cp -R app www/app
cp -R wireframes www/wireframes

# Capacitor lädt index.html aus der Wurzel; der Einstieg der App liegt
# aber in app/. auth.js schickt von dort aus weiter auf login.html,
# wenn niemand angemeldet ist.
cat > www/index.html <<'HTML'
<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Plattenregal</title>
<meta http-equiv="refresh" content="0; url=./app/index.html">
</head>
<body>
<script>location.replace("./app/index.html");</script>
</body>
</html>
HTML

echo "www/ gebaut: $(find www -type f | wc -l | tr -d ' ') Dateien"
