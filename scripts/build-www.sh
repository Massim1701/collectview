#!/usr/bin/env bash
# Baut www/ für Capacitor: die kostenlose Scanner-App (siehe app/js/app-modus.js).
#
# Die native App kennt weder Sammlung noch Marktplatz noch Abo und verlinkt
# nicht zum Bezahlen -- das Abo (CollectView Plus) gibt es nur auf der
# Webseite. Deshalb kommen die reinen Web-Seiten gar nicht erst ins Paket
# (siehe WEB_SEITEN/WEB_SKRIPTE unten), und der Einstieg ist der Scanner.
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

# Reine Web-Seiten und ihre Skripte bleiben draußen. Verlinkt irgendwo noch
# jemand dorthin, endet der Link im Leeren statt bei einem Bezahlweg --
# test/assets.js prüft zusätzlich, dass alle Skripte der Seiten im Paket sind.
WEB_SEITEN="admin collection detail import inbox index listing-new login marketplace-listing marketplace regeln reset-password wishlist"
WEB_SKRIPTE="abo admin collection csv-import detail feedback home login marketplace offline-cache reset-password sale-text"
for n in $WEB_SEITEN; do rm -f "www/app/$n.html"; done
for n in $WEB_SKRIPTE; do rm -f "www/app/js/$n.js"; done
rm -f www/wireframes/*.html www/wireframes/DESIGN-SYSTEM.md

# Capacitor lädt index.html aus der Wurzel; der Einstieg der App liegt
# aber in app/. auth.js schickt von dort aus weiter auf login.html,
# wenn niemand angemeldet ist.
cat > www/index.html <<'HTML'
<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>CollectView</title>
<meta http-equiv="refresh" content="0; url=./app/scanner.html">
</head>
<body>
<script>location.replace("./app/scanner.html");</script>
</body>
</html>
HTML

echo "www/ gebaut: $(find www -type f | wc -l | tr -d ' ') Dateien"
