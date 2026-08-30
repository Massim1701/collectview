# Plattenregal (Arbeitstitel)

App + Webseite zum Katalogisieren von Schallplatten, CDs und Musik-DVDs/Blu-rays weltweit.

## Funktionen
- Barcode-Scan zur Erkennung von Tonträgern
- Cover-Bilderkennung für ältere Platten ohne Barcode *(geplant)*
- Verlinkung zu YouTube/Spotify zum Reinhören *(geplant)*
- Nutzerkonten mit persönlicher Sammlung

## Struktur

- `wireframes/` – Klickdummy (statisches HTML, mit Live Server ansehen).
  `wireframes/styles.css` ist die **Quelle der Wahrheit für das Design**:
  Tokens (Farben, Radien, Schriften) und Komponentenklassen. Neue Screens
  bauen darauf auf, statt eigene Stile zu erfinden.
- `app/` – die funktionierende App.

### Seiten in `app/`

| Datei | Zweck |
|---|---|
| `login.html` | Anmelden / Registrieren (Supabase Auth) |
| `index.html` | Home-Dashboard: Kennzahlen, zuletzt hinzugefügt, Formatübersicht |
| `collection.html` | Sammlung mit Suche, Formatfilter und Sortierung |
| `scanner.html` | Barcode-Scan (ZXing) → Discogs-Lookup → speichern |

Alle Seiten sind geschützt: ohne Session leitet `requireAuth()` auf
`login.html?next=…` um.

### JavaScript in `app/js/`

Klassische Scripts (keine ES-Module, kein Build-Schritt) – die Ladereihenfolge
in den HTML-Dateien ist deshalb relevant:

```
supabase-js → config.js → ui.js → auth.js → db.js → <seite>.js
```

| Datei | Inhalt |
|---|---|
| `auth.js` | Supabase-Client (`sb`), Session, `requireAuth()`, An-/Abmelden |
| `db.js` | Abfragen auf `collection_items`, Kennzahlen, Filter, Suche, Sortierung |
| `ui.js` | Geteilte Render-Bausteine (Cover, Listenkarte, Leerzustände, Bottom-Nav) |
| `home.js`, `collection.js`, `scanner.js`, `login.js` | Seitenlogik |

`app/app.css` liegt als App-Layer über `wireframes/styles.css` und ergänzt nur,
was die echten Seiten zusätzlich brauchen (responsives Shell statt Phone-Frame,
fixierte Bottom-Nav, Lade- und Leerzustände).

## Datenquelle

Discogs API (`/database/search?barcode=…`) – deckt auch Musik-DVDs/Blu-rays ab.

## Datenbank

Tabelle `collection_items` (Supabase, Zugriff über Row Level Security je `user_id`):

```
id · user_id · discogs_id · title · artist · format · year
country · barcode · cover_url · created_at · notes
```

Offen: eine Spalte `genre text` fehlt. Das Home-Dashboard zeigt deshalb
„Formate" statt der in den Wireframes vorgesehenen „Genres". Sobald die Spalte
existiert und beim Scannen aus dem Discogs-Ergebnis mitgeschrieben wird, kann
`computeStats()` in `db.js` darauf umgestellt werden.

## Lokal starten

Die App braucht einen echten Webserver (Kamera-Zugriff und Supabase
funktionieren nicht über `file://`):

```bash
python3 -m http.server 8000
# dann http://localhost:8000/app/login.html öffnen
```
