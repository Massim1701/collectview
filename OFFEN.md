# Offene Punkte

Diese Datei ist die einzige verbindliche Liste. **Vor jeder Übergabe lesen,
nach jedem Zug aktualisieren.**

Sie existiert, weil drei Übergaben hintereinander „`db/rollen.sql` gegen die
DB abgleichen" verlangten, obwohl das längst erledigt war: die Listen lagen
in `~/Downloads/*.md`, wo die jeweils andere Sitzung sie nicht sehen konnte.
Beide Sitzungen sehen den Code — also gehört die Liste in den Code.

Stand: 01.09.2026

---

## Braucht Massimo — niemand sonst kommt da ran

### 1. Edge Functions deployen · discogs-suche steht, zwei fehlen noch

**`discogs-suche` ist seit 01.09.2026 deployt und geprüft** — 50 Treffer,
alle 50 mit `cover_image`, gegen vorher 50 von 50 *ohne*. Ohne JWT antwortet
sie `401`, steht also nicht als offener Discogs-Zugang im Netz. Der
`DISCOGS_TOKEN` liegt als Secret im Dashboard, nicht im Repo.

Damit sind die Cover-Bilder erledigt — überall, wo live bei Discogs gesucht
wird. Am Client war nichts zu ändern: `discogsSuche()` bevorzugt von sich aus
den Proxy und fiel nur zurück, weil er `404` lieferte.

**Noch nicht deployt**, weil beiden das nötige Secret fehlt — Deployen allein
brächte nur Laufzeitfehler:

| Function | fehlt |
|---|---|
| `cover-erkennen` | `GOOGLE_VISION_KEY` |
| `abo-pruefen` | `APPLE_KEY_ID`, `APPLE_ISSUER_ID`, `APPLE_PRIVATE_KEY`, `GOOGLE_PLAY_SERVICE_ACCOUNT` |

Solange `cover-erkennen` fehlt: **keine Bilderkennung**.

Der Vision-Schlüssel braucht ein Google-Cloud-Projekt mit **aktivierter Cloud
Vision API** und **hinterlegter Abrechnung**, auch innerhalb der 1000
Freianfragen pro Monat. Schlüssel auf diese eine API beschränken.

#### Wie deployt wird — die Anmeldung ist die eigentliche Hürde

`supabase login` **funktioniert in einer Agenten-Sitzung nicht**: ohne TTY
bricht der Browser-Flow sofort ab mit `Cannot use automatic login flow inside
non-TTY environments`. Das kostete eine ganze Sitzung, weil der Befehl
scheinbar nichts tat — kein Fenster ging auf, der Keychain-Eintrag blieb alt.

Der Keychain hält weiterhin das Konto `welove80sDE-sys`
(`manca.massimo@gmail.com`), das nur `bmoafuwdzbwxnrrmjakd` sieht und auf
`mevmpihydpksruhmzzwr` mit `403` läuft. **Nicht** per `supabase login`
überschreiben — Claude Web hängt daran.

Stattdessen liegt in `supabase/.env` (gitignoriert) ein Personal Access Token
des Kontos, dem die Org Fornetta und das Projekt `plattenregal` gehören:

```bash
export SUPABASE_ACCESS_TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' supabase/.env | cut -d= -f2-)
supabase functions deploy <name> --project-ref mevmpihydpksruhmzzwr
```

Kein `--no-verify-jwt`: `app/js/discogs.js` schickt Sitzungs-JWT und `apikey`
mit, die Voreinstellung `verify_jwt = true` ist richtig. `SUPABASE_URL` und
`SUPABASE_SERVICE_ROLE_KEY` setzt Supabase selbst. Docker wird nicht
gebraucht — die Warnung beim Deploy ist folgenlos.

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
