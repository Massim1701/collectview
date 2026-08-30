#!/usr/bin/env bash
# Erzeugt App-Icon und Startbildschirm aus scripts/brand/*.html und legt
# sie in den Asset-Katalog des iOS-Projekts.
#
# Warum HTML statt einer Bilddatei: so entstehen die Assets aus denselben
# Tokens und derselben Schrift wie die App. Ändert sich die Palette,
# reicht ein erneuter Lauf – kein Grafikprogramm, keine Handarbeit.
#
# Zwei Randbedingungen, die im Markup stehen und dort begründet sind:
#   · Das Icon darf kein Alpha und keine runden Ecken haben. iOS maskiert
#     selbst, und der App Store weist Icons mit Transparenz ab.
#   · Der Startbildschirm wird mit scaleAspectFill gezeigt. Von den
#     2732×2732 sieht ein 9:19,5-Telefon nur rund 1257px in der Mitte –
#     alles Inhaltliche muss deutlich darin liegen.
set -euo pipefail
cd "$(dirname "$0")/.."

CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
[ -x "$CHROME" ] || { echo "Chrome nicht gefunden: $CHROME (per CHROME=… überschreiben)"; exit 2; }
PORT="${PORT:-8807}"

python3 -m http.server "$PORT" >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT
for _ in $(seq 20); do curl -sf "http://localhost:$PORT/scripts/brand/icon.html" >/dev/null && break; sleep 0.2; done

TMP=$(mktemp -d)
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --virtual-time-budget=9000 \
  --window-size=1024,1024 --screenshot="$TMP/icon.png" \
  "http://localhost:$PORT/scripts/brand/icon.html" 2>/dev/null
for modus in hell dunkel; do
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --virtual-time-budget=9000 \
    --window-size=2732,2732 --screenshot="$TMP/splash-$modus.png" \
    "http://localhost:$PORT/scripts/brand/splash.html?modus=$modus" 2>/dev/null
done

# Alpha würde den App Store stören – sicherheitshalber prüfen statt hoffen.
if [ "$(sips -g hasAlpha "$TMP/icon.png" | tail -1 | awk '{print $2}')" != "no" ]; then
  echo "Icon hat einen Alphakanal – das weist der App Store ab."; exit 1
fi

cp "$TMP/icon.png"          ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png
cp "$TMP/splash-hell.png"   ios/App/App/Assets.xcassets/Splash.imageset/splash-hell.png
cp "$TMP/splash-dunkel.png" ios/App/App/Assets.xcassets/Splash.imageset/splash-dunkel.png
rm -rf "$TMP"

echo "Icon und Startbildschirm erneuert (hell + dunkel)."
