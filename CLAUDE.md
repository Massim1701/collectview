# Plattenregal – Hinweise für Claude

App + Webseite zum Katalogisieren von Schallplatten, CDs und Musik-DVDs/Blu-rays.

## Arbeitsteilung

Zwei Stränge, die sich denselben Design-Layer teilen:

- **App** (`/app`, Wireframes `home/collection/detail/scan/scan-results/onboarding/profile.html`)
- **Marketing** (`wireframes/landing.html`, `wireframes/styles.css`, Preisseite,
  Marktplatz) – wird separat bearbeitet.

Vor Änderungen an `wireframes/styles.css` abklären: die Datei gehört dem
Marketing-Strang und wird dort aktiv angefasst. Erst `git pull`/`git log`
prüfen, bevor darauf aufgebaut wird – das Farbschema hat schon einmal
mitten in der Arbeit gewechselt (dunkel → hell).

## Design-System

`wireframes/styles.css` ist die **Quelle der Wahrheit**: Tokens und
Komponentenklassen (`.app-frame`, `.card`, `.btn-primary`, `.list-card`,
`.cover`, `.icon-badge`, `.segmented`, `.chip`, `.track-row`, `.menu-item`, …).
Nichts davon neu erfinden – erst dort nachsehen, dann bauen.

`app/app.css` liegt als **App-Layer darüber** und ergänzt nur, was die echten
Seiten zusätzlich brauchen: responsives Shell statt Phone-Frame, fixierte
Bottom-Nav, Lade- und Leerzustände, Detailseite.

### Farben

Flächen und Text brauchen unterschiedliche Tokens:

| Zweck | Token |
|---|---|
| Flächen (FAB, Buttons, Chips) | `--accent`, `--danger` |
| **Text** auf dem Hintergrund | `--accent-text`, `--danger-ink` |

`--accent` (#FF9635) erreicht als Textfarbe auf Creme nur 2,0:1 und reißt
damit WCAG AA. Gleiches gilt für `--text-faint` – für Kleintext
`--text-muted` verwenden.

## Technik

**Kein Build-Schritt.** Klassische `<script>`-Tags, keine ES-Module, damit die
Seiten ohne Toolchain laufen. Die **Ladereihenfolge ist deshalb relevant**:

```
supabase-js → config.js → ui.js → auth.js → db.js → <seite>.js
```

Alle Top-Level-Namen teilen sich einen globalen Scope – vor einem neuen
`const`/`let` auf oberster Ebene prüfen, dass der Name nicht schon in einer
Datei belegt ist, die auf derselben Seite geladen wird. Der Supabase-Client
heißt `sb`, weil `window.supabase` die Bibliothek ist.

| Datei | Inhalt |
|---|---|
| `js/auth.js` | Client, Session, `requireAuth()`, An-/Abmelden |
| `js/db.js` | Nur Supabase: Abfragen, Kennzahlen, Filter, Suche, Sortierung |
| `js/ui.js` | Geteilte Render-Bausteine, Bottom-Nav |
| `js/<seite>.js` | Seitenlogik |

Jede App-Seite ist über `requireAuth()` geschützt und leitet ohne Session auf
`login.html?next=…` um.

## Lokal starten

Braucht einen echten Webserver – Kamera-Zugriff und Supabase funktionieren
nicht über `file://`:

```bash
python3 -m http.server 8000
# http://localhost:8000/app/login.html
```

## Datenbank

`collection_items` (Supabase, RLS je `user_id`):

```
id · user_id · discogs_id · title · artist · format · year
country · barcode · cover_url · created_at · notes
```

- **Keine `genre`-Spalte.** Das Home-Dashboard zeigt deshalb „Formate" statt
  der in den Wireframes vorgesehenen „Genres".
- `notes` existiert, wird bisher nirgends geschrieben.
- Beim Löschen die Anzahl gelöschter Zeilen prüfen (`.delete().select()`):
  ohne DELETE-Policy meldet Postgres unter RLS **keinen Fehler**, löscht aber
  auch nichts.
- `marketplace_listings` / `marketplace_messages` gehören zum Marketing-Strang.

## Discogs

- `/database/search?barcode=…` – Treffersuche beim Scannen.
- `/releases/<id>` – Tracklist, Label, Katalognummer, Genres, Videos.
- **25 Anfragen pro Minute und IP.** HTTP 429 wird im Scanner abgefangen
  (Hinweis-Banner, kein automatischer Neuversuch – der belastet das Limit nur
  weiter).
- Discogs liefert **keine Spotify-ID**. Spotify deshalb nur als vorbereitete
  Suche verlinken, nie als geratener Direktlink.

## Prüfen vor dem Abschluss

Es gibt keine Testsuite. Geprüft wird mit Headless Chrome gegen einen lokalen
Server, mit Stubs für `requireAuth`/`fetchCollection` statt einer echten
Session:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --disable-gpu --virtual-time-budget=6000 \
  --dump-dom "http://localhost:8000/app/index.html"
```

Zwei Fallen dabei:

- Headless-Chrome erzwingt **mindestens 500px Fensterbreite**. Bei
  `--window-size=390,…` wird der Screenshot nur beschnitten – das ist kein
  Layout-Fehler. Überlauf stattdessen über `scrollWidth === innerWidth` prüfen.
- Ein DOM-Test allein reicht nicht: `el.hidden === true` kann stimmen, während
  das Element sichtbar bleibt, weil eine Klassenregel (`display:flex`) das
  `[hidden]`-Attribut schlägt. Immer zusätzlich einen Screenshot ansehen.

## Commits

Deutsche Commit-Messages, kleine Schritte, eine abgeschlossene Änderung pro
Commit. Der Betreff nennt das Ergebnis, der Body das Warum.
