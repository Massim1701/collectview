# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Das Produkt heißt durchgängig **Plattenregal** – Markenschriftzug, Seitentitel
und Doku. Der Name ist ein Arbeitstitel und kann später ersetzt werden; er
gehört deshalb nicht in Bezeichner, Tabellennamen oder Dateipfade.

Sprache im Projekt: **Deutsch** – Oberflächentexte, Kommentare und Commit-Messages.

## Befehle

**Es gibt keinen Build-Schritt und keinen Paketmanager.** Kein `package.json`,
keine Abhängigkeiten – die Seiten laufen direkt im Browser.

```bash
python3 -m http.server 8000        # http://localhost:8000/app/login.html
```

Ein echter Webserver ist Pflicht: Kamera-Zugriff (ZXing) und Supabase
funktionieren nicht über `file://`.

### Tests

```bash
./test/run.sh                      # alle test/*.test.html, Exit-Code 1 bei Fehlern
CHROME=/pfad/zu/chrome ./test/run.sh
```

Der Runner startet selbst einen Server, fährt jede `test/*.test.html` in
Headless Chrome und liest das Ergebnis base64-kodiert aus dem `<title>`.
Kein npm, keine Abhängigkeiten. Eine einzelne Datei laufen lassen: die
anderen `*.test.html` kurz umbenennen, oder die URL direkt im Browser öffnen –
die Tests laufen dort genauso.

Eine neue Testdatei braucht nur `test/assert.js`, die zu prüfenden Module und
am Ende `runTests()`. Stubs für `sb`/`currentUser` als `var` **vor** dem Modul
deklarieren, das sie benutzt.

### Seiten von Hand prüfen

Für angemeldete Seiten eine Stub-Datei neben `db.js` einhängen, die
`requireAuth`, `fetchCollection` und `renderAccountRow` überschreibt
(`auth.js` und `config.js` dabei aus den `<script>`-Tags herausnehmen,
`db.js` **behalten** – sonst fehlen `computeStats` und Co.):

```bash
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$CHROME" --headless=new --disable-gpu --virtual-time-budget=6000 \
  --dump-dom "http://localhost:8000/app/index.html"
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --virtual-time-budget=6000 \
  --window-size=500,1200 --screenshot=/tmp/x.png "http://localhost:8000/app/index.html"
```

Syntaxprüfung einzelner Dateien: `node --check app/js/<datei>.js`.

### Zwei Fallen beim Prüfen

- Headless Chrome erzwingt **mindestens 500px Fensterbreite**. Bei
  `--window-size=390,…` wird der Screenshot nur beschnitten – das ist kein
  Layout-Fehler. Horizontalen Überlauf über `scrollWidth === innerWidth` prüfen.
- Ein DOM-Test allein reicht nicht: `el.hidden === true` kann zutreffen,
  während das Element sichtbar bleibt, weil eine Klassenregel (`display:flex`)
  das `[hidden]`-Attribut schlägt. Immer zusätzlich einen Screenshot ansehen.

## Architektur

Zwei Ebenen, die sich Design und Datenzugriff teilen:

- **`wireframes/`** – statischer Klickdummy im 390×844-Phone-Frame plus die
  Marketing-Seiten (`landing.html`, `pricing.html`). Dient als Design-Vorlage.
- **`app/`** – die echte App: dieselben Komponentenklassen, aber responsives
  Layout statt Phone-Frame, und mit Supabase verbunden.

### Kein Build heißt: Ladereihenfolge ist Architektur

Klassische `<script>`-Tags, keine ES-Module. Jede App-Seite lädt in dieser
Reihenfolge, und **alle Top-Level-Namen teilen sich einen globalen Scope**:

```
supabase-js → config.js → ui.js → auth.js → db.js → <seite>.js
```

Vor einem neuen `const`/`let` auf oberster Ebene prüfen, dass der Name nicht
schon in einer Datei belegt ist, die auf derselben Seite geladen wird – sonst
stirbt die Seite mit „Identifier already declared". Der Supabase-Client heißt
`sb`, weil `window.supabase` bereits die Bibliothek ist.

| Datei | Rolle |
|---|---|
| `js/auth.js` | Client `sb`, Session, `requireAuth()`, An-/Abmelden, `renderAccountRow()` |
| `js/db.js` | **Nur Supabase-Zugriffe auf `collection_items`** plus Ableitungen (Kennzahlen, Format-Filter, Suche, Sortierung) |
| `js/ui.js` | Geteilte Render-Bausteine (Cover, Listenkarte, Leerzustände) und die Bottom-Nav |
| `js/<seite>.js` | Seitenlogik, ruft am Ende `init()` |

`js/marketplace.js` ist bewusst eigenständig: es bedient alle drei
Marktplatz-Seiten und nutzt von den anderen Modulen nur die globalen
Funktionen, ohne sie zu verändern.

Fremd-APIs bleiben aus `db.js` heraus – der Discogs-Release-Abruf lebt in
`js/detail.js`, die Barcode-Suche in `js/scanner.js`.

### Seitenschutz

Jede App-Seite ruft `requireAuth()` und leitet ohne Session auf
`login.html?next=…` um. `next` akzeptiert nur relative `.html`-Ziele (kein
offener Redirect).

## Design-System

`wireframes/styles.css` ist die **Quelle der Wahrheit**: Tokens und
Komponentenklassen (`.card`, `.btn-primary`, `.list-card`, `.cover`,
`.icon-badge`, `.segmented`, `.chip`, `.track-row`, `.menu-item`, `.link-chip`,
`.bottomnav`, …). Erst dort nachsehen, dann bauen – nichts neu erfinden.

`app/app.css` liegt als App-Layer darüber und ergänzt nur, was die echten
Seiten zusätzlich brauchen: responsives Shell, fixierte Bottom-Nav, Lade- und
Leerzustände, Detailseite, Hinweisbanner.

**`wireframes/styles.css` und die Marketing-Seiten werden parallel von einem
anderen Strang bearbeitet.** Vor dem Aufsetzen darauf `git log` prüfen – das
Farbschema hat schon einmal mitten in der Arbeit gewechselt (dunkel → hell),
und eine gleichzeitige Änderung an `app/scanner.html` hat dabei einen Refactor
überschrieben.

### Flächen- und Textfarben sind verschiedene Tokens

| Zweck | Token |
|---|---|
| Flächen (FAB, Buttons, Chips) | `--accent`, `--danger` |
| **Text** auf dem Hintergrund | `--accent-text`, `--danger-ink` |

`--accent` (#FF9635) erreicht als Textfarbe auf dem Creme-Hintergrund nur
2,0:1 und reißt damit WCAG AA. Gleiches gilt für `--text-faint` – für
Kleintext `--text-muted` verwenden. Diese Tokens **nicht** in `app.css`
nachbauen; sie kommen aus `styles.css`.

## Datenbank (Supabase, RLS je Nutzer)

```
collection_items       id · user_id · discogs_id · title · artist · format · year
                       country · barcode · cover_url · created_at · notes

marketplace_listings   id · seller_id · collection_item_id · title · artist · format
                       year · price_cents · currency · description · cover_url
                       status · created_at

marketplace_messages   id · listing_id · sender_id · recipient_id · body · created_at

feedback               id · user_id · category · message · page · user_agent · created_at
```

Neue Tabellen kommen als SQL nach `db/` und werden im Supabase-SQL-Editor
ausgeführt – siehe `db/feedback.sql`.

- **Keine `genre`-Spalte** in `collection_items`. Das Home-Dashboard zeigt
  deshalb „Formate" statt der in den Wireframes vorgesehenen „Genres".
- `notes` existiert, wird bisher nirgends geschrieben.
- Beim Löschen die Zahl der gelöschten Zeilen prüfen (`.delete()….select()`):
  ohne DELETE-Policy meldet Postgres unter RLS **keinen Fehler**, löscht aber
  auch nichts. `deleteItem()` in `db.js` macht das vor.
- Der anon key in `app/config.js` ist absichtlich öffentlich; der Schutz liegt
  vollständig in den RLS-Policies.

## Discogs

- `/database/search?barcode=…` – Treffersuche beim Scannen.
- `/releases/<id>` – Tracklist, Label, Katalognummer, Genres, Videos.
- **25 Anfragen pro Minute und IP.** HTTP 429 wird im Scanner mit einem
  stehenden Hinweisbanner abgefangen – bewusst ohne automatischen Neuversuch,
  der würde das Limit nur weiter belasten.
- Discogs liefert **keine Spotify-ID**. Spotify deshalb nur als vorbereitete
  Suche verlinken, nie als geratener Direktlink.
- Die Detailseite rendert erst die gespeicherten Daten und reichert danach mit
  Discogs an, damit sie bei Ausfall oder Limit benutzbar bleibt.

## Commits

Deutsche Commit-Messages, kleine Schritte, eine abgeschlossene Änderung pro
Commit. Der Betreff nennt das Ergebnis, der Body das Warum.
