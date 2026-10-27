#!/usr/bin/env python3
"""Baut das Auslieferungspaket _pages/ für Cloudflare Pages (collectview.site).

Inhalt: die neue Webseite (site/), die Web-App (app/), die Preisseite samt Stylesheet (wireframes/),
robots.txt und sitemap.xml. Die Pfade bleiben wie bei der bisherigen Live-Seite (/app/..., /wireframes/...),
damit Anmeldung, Stripe-Rückkehr und Links weiter funktionieren.
Aufruf: python3 site/stage.py   (nur Standardbibliothek)
"""
import pathlib, shutil

WURZEL = pathlib.Path(__file__).resolve().parent.parent
SITE = WURZEL / "site"
ZIEL = WURZEL / "_pages"

if ZIEL.exists():
    shutil.rmtree(ZIEL)
ZIEL.mkdir()

NICHT = {"build.py", "check.py", "stage.py", "README.md"}
for p in SITE.iterdir():
    if p.name in NICHT or p.name.startswith("."):
        continue
    if p.is_dir():
        shutil.copytree(p, ZIEL / p.name)
    else:
        shutil.copy2(p, ZIEL / p.name)

for ordner in ("app", "wireframes"):
    shutil.copytree(WURZEL / ordner, ZIEL / ordner)

(ZIEL / "robots.txt").write_text("""User-agent: *
Allow: /
Disallow: /app/
Disallow: /wireframes/

Allow: /wireframes/pricing

Sitemap: https://collectview.site/sitemap.xml
""", encoding="utf-8")

seiten = [("", "weekly", "1.0"), ("plus", "weekly", "0.8"), ("download", "weekly", "0.8"), ("wireframes/pricing", "weekly", "0.7"),
          ("support", "monthly", "0.3"), ("datenschutz", "yearly", "0.2"), ("impressum", "yearly", "0.2")]
xml = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
for pfad, freq, prio in seiten:
    xml += ["  <url>", f"    <loc>https://collectview.site/{pfad}</loc>", f"    <changefreq>{freq}</changefreq>", f"    <priority>{prio}</priority>", "  </url>"]
xml.append("</urlset>")
(ZIEL / "sitemap.xml").write_text("\n".join(xml) + "\n", encoding="utf-8")

dateien = [f for f in ZIEL.rglob("*") if f.is_file()]
print(f"_pages/ gebaut: {len(dateien)} Dateien, {sum(f.stat().st_size for f in dateien)/1e6:.1f} MB")
