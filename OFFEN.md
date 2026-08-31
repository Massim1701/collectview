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

### 2. In-App-Kauf · Serverseite steht, Store-Seite fehlt

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

**Noch nicht gebaut:** die Client-Seite. Die App kann bisher keinen Kauf
auslösen — dafür fehlt ein Capacitor-Plugin und der Ablauf auf `pricing.html`.

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
- **Licht-Knopf auf iOS ungeklärt.** Er war lange sichtbar, weil
  `.btn-secondary` das `hidden`-Attribut schlug — das ist behoben. Ob WebKit
  `torch` wirklich meldet, zeigt erst der nächste Gerätetest. Meldet es das
  nicht, bräuchte es `AVCaptureDevice.torchMode`, also nativen Swift-Code.
- **Android: Start geprüft, Scanner nicht.** Das Debug-APK läuft im Emulator
  `Pixel_9_Pro`, der Anmeldebildschirm kommt vollständig hoch — Schriften,
  Sprachauswahl und Palette laden also aus dem Bundle. Ungeprüft bleibt alles
  hinter der Anmeldung: Kamera, Barcode-Scan, Texterkennung. Der Emulator hat
  keine echte Kamera; dafür braucht es ein Gerät.
- **`app/vendor/water.css` ist nirgends eingebunden.** Überbleibsel; löschen,
  sobald sicher ist, dass niemand es braucht.

---

## Erledigt — bitte nicht erneut auf eine Übergabeliste setzen

- **Migrationen** `db/releases.sql` und `db/scan-limit.sql` sind ausgeführt.
  Bestätigt über REST *und* den Selbsttest auf dem Gerät.
- **`db/rollen.sql` abgleichen** — hinfällig. Die Datei war ein Duplikat des
  bereits committeten `db/roles.sql` und hätte geschadet (anderer
  Trigger-Name, Obergrenze wäre doppelt geprüft worden). Gelöscht. Der fehlende
  View `profiles_public` steht jetzt in `db/roles.sql`.
- **Texterkennung** läuft vollständig lokal: Worker, WASM-Kern, die vom Worker
  nachgeladene `.wasm.js` und die Sprachdaten. Keine Netz-Abhängigkeit mehr
  ausser Discogs selbst.
- **Rebrand auf CollectView** ist vollständig — kein `Plattenregal` mehr im Repo.
- **Android-Plattform** ist angelegt, inklusive Kameraberechtigung.
- **Repo umbenannt** auf `github.com/Massim1701/collectview`. Der fehlende
  PAT-Bereich *Administration: Read and write* ist gesetzt, `gh repo rename`
  funktioniert ab jetzt. Lokales Remote ist umgestellt.
