# CollectView Webseite (neuer Stil)

Statische Seiten für collectview.site: Startseite, Die App, Plus, Support, Datenschutz, Impressum.
Stil: helles „Porzellan", Bricolage Grotesque (dünn/fett), ein Akzent (Minze), Zeilen mit Linien statt Karten.

- `build.py` erzeugt die HTML-Dateien (`python3 site/build.py`). Die Vorlage der Startseite liegt auf dem
  Rechner des Autors (`~/Entwicklung/collectview-mockup`), die erzeugten Dateien sind committet und maßgeblich.
- `assets/` enthält CSS, JS, die Schrift und fünf KI-erzeugte Fotos (ChatGPT/Grok, erfundene Personen).
- **Plattencover nur als 8×8-Mosaik** (`assets/img/cover/`, je wenige hundert Bytes, Farbfelder statt Bildinhalt).
  Die Originale liegen nicht im Repo. Die Rechte an den Covern liegen bei Dritten; ob das Mosaik für die
  Veröffentlichung reicht, ist nicht rechtlich geklärt, vor dem Livegang prüfen (oder auf gezeichnete Cover zurückgehen).

## Deploy (vom Fornetta-Server aus)
`.forgejo/workflows/website-deploy.yml` läuft auf dem Forgejo-Runner auf Fornetta: prüft die Seite (`site/check.py`),
baut mit `site/stage.py` das Paket `_pages/` und veröffentlicht es bei **Cloudflare Pages** (Projekt
`collectview-website`, im Cloudflare-Hauptkonto des Inhabers).

Das Paket enthält die neue Webseite (`site/`), die **Web-App** (`app/`) und die Preisseite samt Stylesheet
(`wireframes/`) unter denselben Pfaden wie auf der bisherigen Live-Seite (`/app/...`, `/wireframes/pricing`),
dazu `robots.txt` und `sitemap.xml`. Die Seite „Die App" heißt `/download`, weil `/app/` die Web-App ist.

Stand 27.10.2026 (umgestellt, live):
- Pages-Projekt `collectview-website` liefert `collectview.site` und `www.collectview.site` aus (Zertifikat aktiv).
- Die Domain liegt als Website im Cloudflare-Hauptkonto; Nameserver `kanye.ns.cloudflare.com` und
  `reza.ns.cloudflare.com` sind bei Namecheap eingetragen. Mail-Einträge (MX/SPF der Namecheap-Weiterleitung) sind erhalten.
- Web-App (`/app/...`), Preisseite und Rechtstexte laufen unter denselben Pfaden wie vorher.
- Der alte Worker `collectview-site` im früheren Cloudflare-Konto ist nicht mehr beteiligt.
- Nicht übernommen: der Proxy `/apple/abo-notify` (nur für Apple-Abos, die App verkauft nichts mehr).

Rückweg: Nameserver bei Namecheap wieder auf `fred.ns.cloudflare.com` und `gloria.ns.cloudflare.com` stellen
(solange das alte Konto die Zone noch hält).

Automatisierung (einmalig): In Forgejo (`massimo/collectview`, Einstellungen, Actions, Secrets) `CLOUDFLARE_API_TOKEN`
(Berechtigung „Cloudflare Pages: Bearbeiten") und `CLOUDFLARE_ACCOUNT_ID` (Konto-ID aus dem Cloudflare-Dashboard) anlegen,
Actions für das Repo einschalten.

- **KI-Fotos** sind auf der Startseite in der Fußzeile gekennzeichnet („mit KI erstellt, Personen erfunden"); `check.py` bricht ab, wenn der Hinweis fehlt.

## Offen
- Android-Download und App-Store-Link: `download.html` zeigt „demnächst"; Links eintragen, sobald die Store-Einträge live sind.
- Preis: nur das Web-Jahresabo (24,90 € pro Jahr). Der monatliche Preis (3,99 €) entfällt laut Entscheidung vom 27.10.2026; in `wireframes/pricing.html` und bei Stripe/den Stores steht er noch.
- Impressum/Datenschutz verwenden die Anbieterangaben von driftware.online (Driftware, Nohlstr. 215, Oberhausen, info@driftware.online).
