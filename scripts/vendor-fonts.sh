#!/usr/bin/env bash
# Holt Instrument Serif + Manrope von Google Fonts nach app/vendor/fonts/.
#
# Zwei Gründe, nicht per <link> einzubinden:
#   1. Ohne Netz fällt die App sonst auf Georgia/System zurück – in der
#      nativen Verpackung sieht sie damit kaputt aus statt nur schlicht.
#   2. Google Fonts direkt einzubinden überträgt die IP jedes Nutzers an
#      Google. Für eine App mit deutschem Publikum ist das ein
#      DSGVO-Thema, das man sich sparen kann.
#
# Nur latin und latin-ext: die App spricht DE/EN/IT/PL/ES, latin-ext
# deckt das Polnische ab. Kyrillisch, Griechisch und Vietnamesisch
# würden das Bundle nur aufblähen.
set -euo pipefail
cd "$(dirname "$0")/.."

UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
URL="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Manrope:wght@400;500;600;700;800&family=Big+Shoulders+Display:wght@600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap"

rm -rf app/vendor/fonts
mkdir -p app/vendor/fonts

curl -sf -A "$UA" "$URL" -o /tmp/pr-fonts.css

python3 - <<'PY'
import re, subprocess, io, os

css = io.open("/tmp/pr-fonts.css", encoding="utf-8").read()

# Jeder Block ist ein Kommentar mit dem Zeichensatz plus ein @font-face.
blocks = re.findall(r"/\*\s*([a-z-]+)\s*\*/\s*(@font-face\s*\{[^}]*\})", css)
keep, files = [], {}

for charset, block in blocks:
    if charset not in ("latin", "latin-ext"):
        continue
    url = re.search(r"url\((https://fonts\.gstatic\.com/[^)]+)\)", block)
    if not url:
        continue
    remote = url.group(1)
    name = os.path.basename(remote.split("?")[0])
    fam = re.search(r"font-family:\s*'([^']+)'", block).group(1).replace(" ", "")
    style = "italic" if "font-style: italic" in block else "normal"
    weight = re.search(r"font-weight:\s*(\d+)", block)
    local = f"{fam}-{weight.group(1) if weight else '400'}-{style}-{charset}.woff2"
    files[local] = remote
    keep.append(block.replace(remote, f"./{local}"))

for local, remote in files.items():
    subprocess.run(["curl", "-sf", remote, "-o", f"app/vendor/fonts/{local}"], check=True)

header = ("/* Erzeugt von scripts/vendor-fonts.sh – nicht von Hand ändern.\n"
          "   Instrument Serif und Manrope, nur latin + latin-ext. */\n\n")
io.open("app/vendor/fonts/fonts.css", "w", encoding="utf-8").write(header + "\n\n".join(keep) + "\n")
print(f"{len(files)} Schriftdateien geladen")
PY

echo "app/vendor/fonts: $(du -sh app/vendor/fonts | cut -f1)"
