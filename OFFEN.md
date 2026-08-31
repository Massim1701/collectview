# Offene Punkte

Diese Datei ist die einzige verbindliche Liste. **Vor jeder Übergabe lesen,
nach jedem Zug aktualisieren.**

Sie existiert, weil drei Übergaben hintereinander „`db/rollen.sql` gegen die
DB abgleichen" verlangten, obwohl das längst erledigt war: die Listen lagen
in `~/Downloads/*.md`, wo die jeweils andere Sitzung sie nicht sehen konnte.
Beide Sitzungen sehen den Code — also gehört die Liste in den Code.

Stand: 31.08.2026

---

## Braucht Massimo — niemand sonst kommt da ran

### 1. Edge Functions deployen · der einzige echte Blocker

Beide Functions sind fertig, getestet und antworten mit `404`, weil sie nie
deployt wurden. Die Supabase-CLI ist mit einem **fremden Konto** angemeldet
(`bmoafuwdzbwxnrrmjakd`) und sieht das Projekt `mevmpihydpksruhmzzwr` nicht.

Solange das so bleibt: **keine Cover-Bilder** (Discogs liefert Bild-URLs nur
an authentifizierte Anfragen — gemessen: 50 Treffer, 50 ohne `cover_image`)
und **keine Bilderkennung**.

```bash
cp supabase/.env.beispiel supabase/.env      # Schlüssel im Editor eintragen
supabase login                               # Konto, dem das Projekt gehört
supabase link --project-ref mevmpihydpksruhmzzwr
supabase secrets set --env-file supabase/.env
supabase functions deploy discogs-suche
supabase functions deploy cover-erkennen
```

Der Vision-Schlüssel braucht ein Google-Cloud-Projekt mit **aktivierter Cloud
Vision API** und **hinterlegter Abrechnung**, auch innerhalb der 1000
Freianfragen pro Monat. Schlüssel auf diese eine API beschränken.

### 2. In-App-Kauf · App-Seite steht, Store-Seite läuft bei Claude Web

**Aufteilung, damit nichts doppelt gebaut wird:** Store-Produkte, Schlüssel und
das Deployen der Functions macht **Claude Web**. Die App-Seite (Datenbank,
Edge Function, Client) liegt bei **Claude Code**.

**Diese Produkt-IDs müssen in beiden Stores zeichengenau so heißen** — die App
fragt genau danach, ein Tippfehler äußert sich nur als „Produkt nicht
gefunden":

```
collectview.plus.monatlich
collectview.plus.jaehrlich
```

Der Weg ist entschieden: **In-App-Kauf bei Apple und Google**. Stripe trägt im
Store-Kontext nicht.

Die Datenbankseite ist fertig (`db/abo.sql`, noch **nicht ausgeführt**) und die
Edge Function `abo-pruefen` geschrieben. Was du anlegen musst:

1. **App Store Connect**: Abo-Produkt anlegen, dazu einen In-App-Kauf-Schlüssel
   (.p8) — er wird nur einmal zum Herunterladen angeboten.
2. **Play Console**: dasselbe Abo-Produkt, dazu ein Dienstkonto mit Zugriff auf
   die Play Developer API.
3. Beide Schlüssel nach `supabase/.env` (Vorlage steht in `.env.beispiel`).
4. `db/abo.sql` im SQL-Editor ausführen, Function deployen.

**Ungeprüft:** die beiden Store-Abfragen in `abo-pruefen` sind gegen die
Dokumentation geschrieben, aber nie gegen einen echten Kauf gelaufen. Das geht
erst, wenn die Produkte in beiden Stores existieren.

**Client-Seite steht** (`app/js/abo.js`, `wireframes/pricing.html`): Kaufknopf,
Wiederherstellen-Knopf (von Apple für jede Abo-App verlangt), Anbindung an
`abo-pruefen`, Fehlerbehandlung. 8 Tests decken die Serveranbindung ab.

**Was dort noch fehlt:** das Plugin `cordova-plugin-purchase` ist nicht
installiert. Die zwei Funktionen, die damit sprechen (`storeKaufAusloesen`,
`aboWiederherstellen`), sind gegen die Doku geschrieben und nie gelaufen — im
Kopf der Datei so gekennzeichnet. Sie gehören als Erstes auf einem Gerät
nachgeprüft, sobald die Store-Produkte existieren.

### 3. App Store Connect prüfen

Die Bundle-ID ist beim Rebrand von `online.driftware.plattenregal` auf
`online.driftware.collectview` gewechselt. Liegt dort schon ein Eintrag unter
der alten ID, ist das ein **neuer App-Eintrag**, kein Update.

---

## Technisch offen

- **Nur eine von vier Tesseract-Core-Fassungen ist vendort.** Der Worker
  fordert je nach Gerät `simd-lstm`, `simd`, `lstm` oder die Grundfassung an.
  Die SIMD-Fassung deckt jedes aktuelle Gerät ab; `test/assets.js` weist bei
  jedem Lauf darauf hin, damit es nicht vergessen wird.
- ~~Licht-Knopf auf iOS ungeklärt~~ — **geklärt am 31.08.2026:** der Knopf
  erscheint auf dem iPhone, und seit `b39373f` tut er das nur, wenn das Gerät
  `torch` meldet. WebKit gibt es also heraus; nativer Swift-Code ist nicht
  nötig. Ob das Licht beim Drücken auch angeht, ist noch nicht bestätigt.
- **Android: Start geprüft, Scanner nicht.** Das Debug-APK läuft im Emulator
  `Pixel_9_Pro`, der Anmeldebildschirm kommt vollständig hoch — Schriften,
  Sprachauswahl und Palette laden also aus dem Bundle. Ungeprüft bleibt alles
  hinter der Anmeldung: Kamera, Barcode-Scan, Texterkennung. Der Emulator hat
  keine echte Kamera; dafür braucht es ein Gerät.
- **Schriften und Bibliotheken kommen jetzt überall lokal.** `pricing.html` lud
  Supabase von jsdelivr, neun weitere Wireframes luden Google Fonts vom CDN —
  alle wandern über `build-www.sh` ins App-Bundle. `test/assets.js` setzt die
  Regel aus CLAUDE.md jetzt durch, statt sie nur zu dokumentieren.
- **`app/vendor/water.css` ist nirgends eingebunden.** Überbleibsel; löschen,
  sobald sicher ist, dass niemand es braucht.

---

## Erledigt — bitte nicht erneut auf eine Übergabeliste setzen

- **Cover-Erkennung trägt jetzt, auch mit Spiegelungen.** Am Gerät bestätigt
  (31.08.2026): eine Hülle, die zuvor nur `\ SPEAK & SPELL I u` ergab, wurde
  in der Klarsichthülle vollständig erkannt. Zwei Änderungen zusammen:

  1. **Zeilenauswahl nach Schriftgröße und Konfidenz** statt nach Reihenfolge
     (`f655313`). Interpret und Titel sind auf einer Hülle das Größte, nicht
     das Oberste — vorher verdrängten Bruchstücke aus dem Glanzlicht den
     Interpreten aus den zwei Plätzen.
  2. **Fünf Bilder statt einem** (`dd39d5e`), bewertet nach Struktur und
     ausgebrannter Fläche, das beste wird ausgewertet. Das Glanzlicht wandert
     mit dem Haltewinkel — derselbe Grund, aus dem Google Lens auf dem
     laufenden Bild arbeitet.

  Zwei naheliegende Wege wurden **gemessen und verworfen**: Bildvorverarbeitung
  (Graustufen, Kontrastspreizung, lokale Schwellwerte — alle 0 von 2 Zeilen,
  eine Spiegelung überschreibt das Bild) und absolute Spiegelungserkennung
  (nicht trennscharf: weisses Cover 88 % helle Fläche gegen Glanzlicht 28 %).

- **Migrationen** `db/releases.sql` und `db/scan-limit.sql` sind ausgeführt.
  Bestätigt über REST *und* den Selbsttest auf dem Gerät.
- **`db/rollen.sql` abgleichen** — hinfällig. Die Datei war ein Duplikat des
  bereits committeten `db/roles.sql` und hätte geschadet (anderer
  Trigger-Name, Obergrenze wäre doppelt geprüft worden). Gelöscht. Der fehlende
  View `profiles_public` steht jetzt in `db/roles.sql`.
- **Texterkennung läuft — auf dem Gerät bestätigt.** Der Selbsttest auf dem
  iPhone zeigt `Texterkennung  "ABBEY ROAD"` (31.08.2026, 11:16 Uhr). Worker,
  WASM-Kern, die vom Worker nachgeladene `.wasm.js` und die Sprachdaten liegen
  alle lokal; ausser Discogs geht nichts mehr ans Netz. `test/texterkennung.js`
  hält das fest, die Kette war an einem Tag zweimal gerissen.
- **Rebrand auf CollectView** ist vollständig — kein `Plattenregal` mehr im Repo.
- **Android-Plattform** ist angelegt, inklusive Kameraberechtigung.
- **Repo umbenannt** auf `github.com/Massim1701/collectview`. Der fehlende
  PAT-Bereich *Administration: Read and write* ist gesetzt, `gh repo rename`
  funktioniert ab jetzt. Lokales Remote ist umgestellt.
