#!/usr/bin/env python3
"""Prüft die Webseite vor dem Deploy. Bricht mit Exit-Code 1 ab, wenn etwas nicht stimmt.

- jede lokale Datei, auf die HTML/CSS verweisen, existiert
- Plattencover nur als winziges 8x8-PNG (nie Originale)
- keine anderen E-Mail-Adressen als info@driftware.online
- keine Reste von Mockup oder echten Covern
Nur Standardbibliothek. Aufruf: python3 -I site/check.py
"""
import pathlib, re, struct, sys

SITE = pathlib.Path(__file__).resolve().parent
ERLAUBT_MAIL = {"info@driftware.online"}
fehler = []

for f in sorted(SITE.glob("*.html")):
    s = f.read_text(encoding="utf-8")
    for m in re.findall(r'(?:src|href)="([^"#?]+)', s):
        if m.startswith(("http", "mailto:", "data:", "/")) or m == "#":
            continue
        if not (SITE / m).exists():
            fehler.append(f"{f.name}: Verweis auf fehlende Datei {m}")
    for mail in re.findall(r"[A-Za-z0-9._-]+@[A-Za-z0-9._-]+\.[a-z]+", s):
        if mail not in ERLAUBT_MAIL:
            fehler.append(f"{f.name}: unerlaubte E-Mail-Adresse {mail}")
    for wort in ("Mockup", "covers-echt", "pexels"):
        if wort.lower() in s.lower():
            fehler.append(f"{f.name}: enthält \"{wort}\"")

css = (SITE / "assets" / "site.css").read_text(encoding="utf-8")
for m in re.findall(r"url\(([^)]+)\)", css):
    m = m.strip("'\"")
    if not m.startswith("data:") and not (SITE / "assets" / m).exists():
        fehler.append(f"site.css: fehlende Datei {m}")

cover = SITE / "assets" / "img" / "cover"
for p in sorted(cover.glob("*")) if cover.exists() else []:
    daten = p.read_bytes()
    if daten[:8] != b"\x89PNG\r\n\x1a\n":
        fehler.append(f"{p.name}: kein PNG (Cover müssen 8x8-Mosaike sein)")
        continue
    breite, hoehe = struct.unpack(">II", daten[16:24])
    if (breite, hoehe) != (8, 8) or len(daten) > 4096:
        fehler.append(f"{p.name}: {breite}x{hoehe}, {len(daten)} Bytes (erlaubt: 8x8, höchstens 4 KB)")

for p in SITE.rglob("*"):
    if p.is_file() and any(t in str(p).lower() for t in ("covers-echt", "covers-mosaik")):
        fehler.append(f"{p.relative_to(SITE)}: gehört nicht in die Webseite")

if fehler:
    print("PRÜFUNG FEHLGESCHLAGEN")
    for f in fehler:
        print(" -", f)
    sys.exit(1)
print("Prüfung ok:", len(list(SITE.glob('*.html'))), "Seiten,", len(list(cover.glob('*.png'))) if cover.exists() else 0, "Mosaik-Cover")
