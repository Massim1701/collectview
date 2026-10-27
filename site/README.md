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
`.forgejo/workflows/website-deploy.yml` läuft auf dem Forgejo-Runner auf Fornetta, prüft die Seite
(`site/check.py`) und veröffentlicht `site/` bei **Cloudflare Pages** (Projekt `collectview-website`).
Branch `main` = Produktion des Pages-Projekts, andere Branches (z. B. `website-neu`) = Vorschau-Adresse
`https://website-neu.collectview-website.pages.dev`. **Der bisherige Worker `collectview-site` und die Live-Seite
collectview.site werden dadurch nicht verändert.**

Einmalig einzurichten (nur der Inhaber kann das):
1. In Cloudflare ein API-Token mit der Berechtigung „Cloudflare Pages: Bearbeiten" erstellen und die Konto-ID notieren.
2. In Forgejo (`massimo/collectview`, Einstellungen, Actions, Secrets) `CLOUDFLARE_API_TOKEN` und
   `CLOUDFLARE_ACCOUNT_ID` anlegen; Actions für das Repo einschalten.
3. Branch pushen oder „Run workflow" auslösen. Fehlen die Secrets, bricht der Lauf mit einer klaren Meldung ab.

Umschalten auf collectview.site (erst nach Prüfung der Vorschau, nicht automatisiert):
- Im Pages-Projekt die Domain `collectview.site` hinzufügen.
- Vorher die Worker-Routen von `collectview-site` (`collectview.site/*`) und `collectview-impressum`
  (`collectview.site/impressum`) entfernen, sonst gewinnen die Worker. `/apple/abo-notify` (Proxy im alten Worker)
  wird nur gebraucht, wenn Apple-Abos weiterlaufen; mit der kostenlosen App entfällt das. Vorher prüfen.
- Rückweg: Domain beim Pages-Projekt entfernen und die Worker-Routen wieder anlegen.

## Offen
- Android-Download und App-Store-Link: `app.html` zeigt „demnächst"; Links eintragen, sobald die Store-Einträge live sind.
- Preis: nur das Web-Jahresabo (24,90 € pro Jahr). Der monatliche Preis (3,99 €) entfällt laut Entscheidung vom 27.10.2026; in `wireframes/pricing.html` und bei Stripe/den Stores steht er noch.
- Impressum/Datenschutz verwenden die Anbieterangaben von driftware.online (Driftware, Nohlstr. 215, Oberhausen, info@driftware.online).
