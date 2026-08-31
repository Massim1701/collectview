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

### 2. Das Abo trägt so nicht · Entscheidung, keine Aufgabe

`wireframes/pricing.html` sagt „sobald Stripe eingerichtet ist". Apple und
Google verlangen für **digitale Abos ihre eigene Kaufabwicklung**; eine App,
die daran vorbei über Stripe kassiert, wird im Review abgelehnt. Im Repo gibt
es keine Zeile In-App-Kauf.

Das betrifft das Geschäftsmodell, nicht ein Feature — und es steht auf keiner
bisherigen Übergabeliste. Drei gangbare Wege:

| Weg | Was er kostet | Was er bringt |
|---|---|---|
| **In-App-Kauf in beiden Stores** | Plugin, zwei Store-Konfigurationen, serverseitige Belegprüfung; 15–30 % Provision | Der einzige Weg, der *in* der App verkaufen darf |
| **Abo nur im Web abschließen** | Stripe bleibt; die App darf darauf nicht einmal verlinken (Apple), in der EU seit DMA gelockert, aber mit Auflagen | Keine Provision, dafür ein Bruch im Ablauf |
| **Kostenlos ohne Abo** | Free-Limit fällt weg, Discogs-Kosten bleiben | Kein Store-Thema mehr |

Bis das entschieden ist, sollte nichts weiter auf dem Abo aufgebaut werden.

### 3. GitHub-Repo umbenennen

Heißt weiter `schallplatten-katalog`. `gh` ist installiert und angemeldet,
aber der **fine-grained PAT** hat *Administration: Read and write* nicht —
ein Token kann sich keine Rechte selbst geben. Entweder in der Weboberfläche
umbenennen oder dem Token die Berechtigung geben.

### 4. App Store Connect prüfen

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
- **Android war nie auf einem Gerät.** Plattform steht, APK baut, Kamera- und
  Sprachdaten-Fallen sind vorweggenommen — geprüft ist davon nichts.
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
