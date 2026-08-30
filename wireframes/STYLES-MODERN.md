# styles.modern.css – moderne Fassung des Design-Systems

Drop-in-Ersatz für `styles.css`. **Gleiche 85 Klassennamen, gleiche Identität**
(Instrument Serif kursiv, Creme, Bernstein). Kein Umbau der Seiten nötig.

## Warum

Die Style-Datenbank bestätigt die bestehende Richtung: für Sammlungen und
Medien empfiehlt sie **Editorial / Magazine** (geringes Accessibility-Risiko,
Light und Dark) und eine warme Bernstein-auf-Creme-Palette – also genau das,
was hier schon steht. Eine andere Optik wäre Veränderung um ihrer selbst
willen.

Was fehlte, war Struktur:

| | vorher | jetzt |
|---|---|---|
| Schriftgrößen | 21 gewachsene Werte (10,5 … 58px) | modulare Skala, 11 Stufen ab 12px |
| Abstände | ~20 Einzelwerte | 4px-Raster, 11 Stufen |
| Schatten | eine Stufe | drei (`sm`/`md`/`lg`) + Rahmen |
| Dark Mode | keiner | `prefers-color-scheme` + `data-theme` |
| Reduced Motion | keins | berücksichtigt |
| Fokus | pro Element | eine Grundregel |
| Touch-Ziele | teils 31×17px | `--target: 44px` durchgängig |

## Umstellen

In den HTML-Dateien den Stylesheet-Pfad tauschen:

```html
<link rel="stylesheet" href="./styles.modern.css">      <!-- wireframes/ -->
<link rel="stylesheet" href="../wireframes/styles.modern.css">  <!-- app/ -->
```

Oder, wenn ihr zufrieden seid: `styles.modern.css` über `styles.css` kopieren –
dann bleibt jeder Pfad, wie er ist.

## Geprüft

- Alle 85 Klassen aus `styles.css` sind übernommen (per `comm` abgeglichen).
- Home und Sammlung gegen das neue Stylesheet gerendert, hell und dunkel.
- Lesbarkeitstests (`test/legibility.test.html`) gegen den Stapel
  `styles.modern.css` + `app.css`: alle 7 grün.
- Kontrastprüfung im Dark Mode: keine Verstöße.

Dabei kam ein Fehler ans Licht, den es auch heute schon gibt: `.menu-item` ist
ein `<button>` und erbt `color` nicht – ohne `color:inherit` steht dort
UA-Schwarz. In Hell fällt das nicht auf, in Dunkel wäre es unlesbar. In beiden
Stylesheets korrigiert.

## Danach

Sobald `styles.modern.css` produktiv ist, kann die Lesbarkeitsebene in
`app/app.css` weitgehend entfallen – die Untergrenzen stecken dann im
Fundament. Die Tests bleiben und halten das fest.
