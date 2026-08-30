#!/usr/bin/env bash
# Führt alle test/*.test.html in Headless Chrome aus.
# Keine Abhängigkeiten außer python3, node und Chrome.
set -uo pipefail
cd "$(dirname "$0")/.."

CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
PORT="${PORT:-8799}"

[ -x "$CHROME" ] || { echo "Chrome nicht gefunden: $CHROME (per CHROME=… überschreiben)"; exit 2; }

python3 -m http.server "$PORT" >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT
for _ in $(seq 20); do
  curl -sf "http://localhost:$PORT/test/assert.js" >/dev/null && break
  sleep 0.2
done

failed=0
total=0

for file in test/*.test.html; do
  [ -e "$file" ] || continue
  echo "── $(basename "$file")"

  dom=$("$CHROME" --headless=new --disable-gpu --no-sandbox --no-first-run \
        --virtual-time-budget=20000 --window-size=900,1000 \
        --dump-dom "http://localhost:$PORT/$file" 2>/dev/null)

  out=$(printf '%s' "$dom" | node -e '
    let s = ""; process.stdin.on("data", d => s += d).on("end", () => {
      const m = s.match(/<title>RESULTS:([A-Za-z0-9+/=]*)<\/title>/);
      if (!m) { console.log("FATAL\tTests wurden nicht ausgefuehrt (kein Ergebnis im Titel)"); process.exit(0); }
      JSON.parse(Buffer.from(m[1], "base64").toString("utf8"))
        .forEach(r => console.log((r.ok ? "PASS" : "FAIL") + "\t" + r.name + (r.ok ? "" : "\t" + r.error)));
    });')

  while IFS=$'\t' read -r status name detail; do
    case "$status" in
      PASS)  total=$((total+1)); printf '   \033[32m✓\033[0m %s\n' "$name" ;;
      FAIL)  total=$((total+1)); failed=$((failed+1)); printf '   \033[31m✗\033[0m %s\n     %s\n' "$name" "$detail" ;;
      FATAL) failed=$((failed+1)); printf '   \033[31m!\033[0m %s\n' "$name" ;;
    esac
  done <<< "$out"
done

echo
if [ "$failed" -gt 0 ]; then
  echo "$failed von $total Tests fehlgeschlagen"
  exit 1
fi
echo "$total Tests bestanden"
