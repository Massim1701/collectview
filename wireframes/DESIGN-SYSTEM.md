# Design-System

`styles.css` ist die Quelle der Wahrheit für Plattenregal – Wireframes,
App und Landingpage laden dieselbe Datei. `app/app.css` liegt als
App-Layer darüber und ergänzt nur, was die echten Seiten zusätzlich
brauchen.

## Tokens statt Einzelwerte

Alles baut auf Skalen auf. Neue Regeln greifen auf die Tokens zu, statt
eigene Werte zu erfinden – sonst wächst wieder ein Wildwuchs heran.

| Gruppe | Tokens |
|---|---|
| Schrift | `--text-2xs` 12 · `--text-xs` 13 · `--text-sm` 14 · `--text-base` 16 · `--text-lg` 18 · `--text-xl` 20 · `--text-2xl` 24 · `--text-3xl` 30 · `--text-4xl` 38 · `--text-5xl` 48 · `--text-6xl` 60 |
| Abstand | `--space-1` … `--space-24`, 4px-Raster |
| Radius | `--radius-xs/sm/md/lg/pill` |
| Schatten | `--shadow-sm/md/lg` + `--shadow-frame` |
| Bewegung | `--dur-fast/dur/dur-slow`, `--ease` |
| Touch | `--target` = 44px |

`--text-2xs` ist ausschließlich für Versalien-Labels (Navigation,
Kennzahlen) gedacht, nicht für Fließtext.

## Farben: Fläche ist nicht Text

| Zweck | Token |
|---|---|
| Flächen (FAB, Buttons, Chips) | `--accent`, `--danger` |
| **Text** auf dem Hintergrund | `--accent-text`, `--danger-ink` |

`--accent` erreicht als Textfarbe auf Creme nur 2,0:1 und reißt WCAG AA.
Für Kleintext `--text-muted` statt `--text-faint`.

## Dark Mode

Nur die Farbrollen werden getauscht, keine einzige Regel doppelt sich.
Automatisch über `prefers-color-scheme`, übersteuerbar per Attribut:

```html
<html data-theme="dark">   <!-- oder "light" -->
```

Wer eine Farbe neu einführt, definiert sie im `:root`-Block **und** in
beiden Dark-Blöcken – sonst bricht sie im dunklen Modus.

## Untergrenzen

Kein Text unter 12px, kein Bedienelement unter 44×44px.
`test/legibility.test.html` prüft das gegen die echten Bausteine aus
`ui.js`; `./test/run.sh` führt es aus.

## Fallstricke

- **`<button>` erbt `color` nicht.** Ohne `color:inherit` steht dort
  UA-Schwarz – im hellen Theme unauffällig, im Dark Mode unlesbar.
  Betrifft jede Komponente, die als Button statt als `div` gebaut wird.
- Seiteneigene `<style>`-Blöcke laden nach `app.css` und überschreiben
  sie. Wer dort eine Größe setzt, muss sie dort auch pflegen.
