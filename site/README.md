# CollectView Webseite (neuer Stil)

Statische Seiten für collectview.site: Startseite, Die App, Plus, Support, Datenschutz, Impressum.
Stil: helles „Porzellan", Bricolage Grotesque (dünn/fett), ein Akzent (Minze), Zeilen mit Linien statt Karten.

- `build.py` erzeugt die HTML-Dateien (`python3 site/build.py`). Die Vorlage der Startseite liegt auf dem
  Rechner des Autors (`~/Entwicklung/collectview-mockup`), die erzeugten Dateien sind committet und maßgeblich.
- `assets/` enthält CSS, JS, die Schrift und fünf KI-erzeugte Fotos (ChatGPT/Grok, erfundene Personen).
- **Keine echten Plattencover** in dieser Seite: Cover sind aus CSS gezeichnet (Rechte der Cover liegen bei Dritten).

## Nicht deployt
collectview.site wird von Cloudflare-Workern ausgeliefert (siehe `web/README.md`). Dieser Branch ändert die
Live-Seite nicht. Zum Veröffentlichen: Dateien in das Assets-Binding des Workers `collectview-site` legen
und `/support`, `/datenschutz` und `/impressum` nicht mehr aus den Worker-Skripten ausliefern, sondern aus
den Seiten hier. `wrangler deploy` braucht Zugänge, die in der Entwicklungssitzung fehlen.

## Offen
- Android-Download und App-Store-Link: `app.html` zeigt „demnächst"; Links eintragen, sobald die Store-Einträge live sind.
- Preise: bewusst nicht genannt (Preisseite und alte Landingpage nannten unterschiedliche Beträge: 3,99 €/Monat bzw. 24,90 €/Jahr).
- Impressum/Datenschutz verwenden die Anbieterangaben von driftware.online (Driftware, Nohlstr. 215, Oberhausen, info@driftware.online).
