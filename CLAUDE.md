# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Das Produkt heißt durchgängig **CollectView** – Markenschriftzug, Seitentitel
und Doku. Der Name ist ein Arbeitstitel und kann später ersetzt werden; er
gehört deshalb nicht in Bezeichner, Tabellennamen oder Dateipfade.

Sprache im Projekt: **Deutsch** – Oberflächentexte, Kommentare und Commit-Messages.

## Befehle

**Die Web-App hat weiterhin keinen Build-Schritt.** `app/` und
`wireframes/` laufen unverändert direkt im Browser – kein Bundler, kein
Transpiler, keine Laufzeit-Abhängigkeiten aus npm.

```bash
python3 -m http.server 8000        # http://localhost:8000/app/login.html
```

Ein echter Webserver ist Pflicht: Kamera-Zugriff (ZXing) und Supabase
funktionieren nicht über `file://`.

**Seit der nativen Verpackung gibt es aber ein `package.json`** – und
zwar ausschließlich für Capacitor, das aus derselben Web-App eine
iOS-/Android-App macht. Wer nur an der Web-App arbeitet, braucht davon
nichts: kein `npm install`, keine der Regeln unten.

```bash
npm run build                      # kopiert app/ + wireframes/ nach www/
npm run ios                        # build + cap sync + Xcode öffnen
```

`www/` und `ios/App/App/public/` sind **erzeugt**, nicht gepflegt – dort
nie von Hand ändern, das nächste `npm run build` überschreibt es. Geändert
wird immer in `app/` bzw. `wireframes/`.

**Fremde Bibliotheken liegen unter `app/vendor/`, nicht am CDN.** Supabase,
ZXing, Tesseract und die beiden Schriften kommen aus dem Repo. Zwei Gründe:
ohne Netz fehlte sonst schon der Supabase-Client und die App startete gar
nicht, und Google Fonts direkt einzubinden überträgt die IP jedes Nutzers
an Google – bei deutschem Publikum ein DSGVO-Thema.

`app/vendor/` ist erzeugt (`npm run vendor`, `scripts/vendor-fonts.sh`) und
liegt trotzdem im Repo: die Web-App soll ohne `npm install` lauffähig
bleiben. Neue Version einer Bibliothek: Version in `package.json` ändern,
dann das jeweilige Skript laufen lassen – nie die Datei in `app/vendor/`
von Hand anfassen.

Einzige Ausnahme, die noch ans Netz geht: die Sprachdaten für die
Texterkennung (`deu+eng`, rund 30 MB). Die lädt Tesseract beim ersten
Cover-Scan nach und legt sie in IndexedDB ab. Alles andere – Login,
Sammlung, Barcode-Scan – läuft ohne Netz an.

`scripts/build-www.sh` ist ein Kopiervorgang, kein Build im üblichen Sinn:
`app/` und `wireframes/` müssen beide mit, weil `app/*.html` auf
`../wireframes/styles.css` und `../wireframes/pricing.html` verweist.

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

## Zusammenarbeit: zwei Stränge, ein Arbeitsverzeichnis

An diesem Repo arbeiten zwei Claude-Sitzungen – eine an der App, eine am
Marketing/Marktplatz. Sie teilen sich **dasselbe Arbeitsverzeichnis ohne
Branches**. Die Lanes sind längst durchlässig: der Marktplatz liegt in
`/app`, das Design-System wurde von beiden Seiten angefasst.

Dateien, die bereits beide Seiten geändert haben:

| Datei | App | Marketing |
|---|---|---|
| `app/scanner.html` | 4 | 4 |
| `wireframes/styles.css` | 1 | 4 |
| `app/index.html` | 1 | 3 |
| `app/app.css` | 8 | 1 |
| `README.md` | 3 | 1 |

**Verbindliche Regeln – jede verhindert einen Vorfall, den es gab:**

1. **Nichts unfertig liegen lassen.** Am Ende jedes Zuges committen. Ein
   Refactor ging verloren, weil `app.js` gelöscht, aber nicht committet
   war – die andere Sitzung schrieb `scanner.html` zurück, das die Datei
   noch lud. Ergebnis: 404, App funktionslos.
2. **Vor jeder Änderung an einer geteilten Datei erst `git log -5` und
   `git status` lesen.** Nicht auf einem Stand aufbauen, der schon
   überholt ist.
3. **Querschnittsthemen an der Wurzel lösen, nicht im eigenen Layer.**
   Beide Seiten haben unabhängig Kontrast-Tokens gebaut – einmal per
   `color-mix` in `app.css`, einmal als feste Werte in `styles.css`.
   Doppelt gelöst, eine Fassung musste wieder weg.
4. **Tokens ändern, nicht Regeln.** Der Palettenwechsel `9d8cf10` lief
   glatt, weil nur Farbrollen getauscht wurden und die Skalen standen.
   So soll es laufen.
5. **Nach einem Palettenwechsel Kontraste nachmessen.** Farben ändern
   heißt Kontraste ändern. `./test/run.sh` prüft Größen und Touch-Ziele,
   **nicht** Kontrast – der wird von Hand gemessen.

Laufen beide Sitzungen gleichzeitig, können sie sich direkt Nachrichten
schicken (`ListAgents` zeigt die erreichbaren Namen). Die App-Sitzung
läuft unter `massimo-ab`.

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

### Untergrenzen für Lesbarkeit

Die App wird von allen Altersgruppen benutzt. `app/app.css` hebt die
Typografie von `styles.css` deshalb an – dort ist vieles auf 10,5–13,5px
ausgelegt, was für ältere Augen mühsam ist.

| Regel | Wert |
|---|---|
| Fließtext und Bedienelemente | ≥ 14px, Listentitel ≥ 16px |
| Versalien-Labels (Nav, Kennzahlen) | ≥ 12px, absolute Untergrenze |
| Touch-Ziele | ≥ 44×44px |

`test/legibility.test.html` prüft das gegen die echten Bausteine aus
`ui.js` – wer eine Größe absenkt, ändert die Untergrenze dort bewusst mit.
`styles.css` bleibt unangetastet, damit Wireframes und Landingpage ihre
eigene Skala behalten.

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
