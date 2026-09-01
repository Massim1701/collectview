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

### 1. Edge Functions · alle drei deployt, beide Stores geprüft

**Alle drei Functions sind deployt** (01.09.2026). Keine antwortet ohne JWT.

| Function | geprüft mit | Ergebnis |
|---|---|---|
| `discogs-suche` | „Fleetwood Mac Rumours" | 50 Treffer, **alle 50 mit `cover_image`** (vorher 0) |
| `cover-erkennen` | echtes Rumours-Cover | `label: "Fleetwood Mac Rumours"` |
| `cover-erkennen` | 1×1-Pixel | leeres `label`, kein geratener Treffer |
| `abo-pruefen` | GET / ohne JWT / falsches JWT | `405` / `401` / `401` |

Am Client war nichts zu ändern: `discogsSuche()` schaltet selbst auf den
Proxy um, und `cover-erkennen` behielt die Antwortform `{ label, entitaeten }`.

**`db/abo.sql` ist gelaufen** (01.09.2026, über die Management-API). Geprüft:
`abo_setzen`, `abo_beenden` und `protect_subscription_fields` existieren, die
vier `store_`-Spalten stehen in `profiles`, der Trigger
`on_profiles_protect_subscription` hängt dran, und die RPCs sind für `anon`
und `authenticated` gesperrt — nur `postgres` und `service_role` dürfen.

#### Store-Zugangsdaten: gelöst, beide Stores tragen

| Store | Stand |
|---|---|
| Google Play | **funktioniert.** Dienstkonto `abo-pruefen@collectview-507309…` holt ein Zugriffstoken (3599 s) mit Scope `androidpublisher`. |
| Apple | **funktioniert.** Neuer Key `5D6595N2G9` (alter `4L3Y2HPQU4` kann bei Bedarf noch widerrufen werden). |

**Auflösung (01.09.2026):** Der alte Key war nie kaputt, und die
Issuer-ID-Theorie war eine Sackgasse. Der wahre Grund für die `401` auf
`api.storekit.itunes.apple.com`: **die App war noch nie eingereicht**
(Abo-Gruppe stand auf „Prepare for Submission"). Apples Doku sagt dazu
ausdrücklich: bekommt man auf der Produktions-URL einen `401`, kann das
eine Sandbox-Transaktion sein — dann mit der Sandbox-Basis-URL erneut
versuchen. Genau das ist der Fall: gegen
`api.storekit-sandbox.itunes.apple.com` kam mit demselben Schlüssel ein
sauberes `404 "Transaction id not found"` (bzw. `400 "Invalid transaction
id"` bei der Test-ID `0`/`1`) — beides authentifizierte Antworten, kein
`401`. Der Satz weiter unten „Ein unvollständiger App-Eintrag ergäbe `404`,
nicht `401`" war also die falsche Prämisse: gilt für die App-*Metadaten*,
nicht dafür, ob die App je einer Review vorgelegen hat.

**Fix in `abo-pruefen`:** `pruefeApple()` versucht erst Produktion, fällt
bei `401` automatisch auf Sandbox zurück — aber nur, wenn der Sicherheits-
schalter `APPLE_SANDBOX_ERLAUBT=true` gesetzt ist (aktuell an, für die
Test-/TestFlight-Phase). **Vor dem echten Launch auf `false` setzen**
(`.env` + `supabase secrets set`) — sonst kann sich jeder mit einem
kostenlosen Apple-Sandbox-Tester-Account ein echtes Abo freischalten,
weil Sandbox-Bestätigungen sonst genauso akzeptiert würden wie echte.
Die Antwort trägt jetzt auch `umgebung` ("Production"/"Sandbox") zum
Mitloggen.

#### Zwei Fallen, die je eine Sitzung gekostet haben

**`supabase login` funktioniert in einer Agenten-Sitzung nicht.** Ohne TTY
bricht der Browser-Flow sofort ab (`Cannot use automatic login flow inside
non-TTY environments`) – und sieht dabei aus, als täte er gar nichts: kein
Fenster geht auf, der Keychain-Eintrag bleibt alt. Der Keychain hält
weiterhin das Konto `welove80sDE-sys` (`manca.massimo@gmail.com`), das nur
`bmoafuwdzbwxnrrmjakd` sieht. **Nicht** überschreiben – Claude Web hängt
daran. Stattdessen liegt in `supabase/.env` ein Personal Access Token des
Kontos, dem die Org Fornetta und das Projekt `plattenregal` gehören:

```bash
export SUPABASE_ACCESS_TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' supabase/.env | cut -d= -f2-)
supabase functions deploy <name> --project-ref mevmpihydpksruhmzzwr
```

Kein `--no-verify-jwt`: die Clients schicken Sitzungs-JWT und `apikey` mit.
`SUPABASE_URL` und `SUPABASE_SERVICE_ROLE_KEY` setzt Supabase selbst. Docker
wird nicht gebraucht, die Warnung beim Deploy ist folgenlos. Secrets **einzeln**
setzen, nie `--env-file supabase/.env` – darin steht auch der Access-Token.

**Der Google-Schlüssel ist ein AI-Studio-Schlüssel, kein Cloud-Schlüssel.**
Präfix `AQ.`, 53 Zeichen. `vision.googleapis.com` nimmt ihn nicht an (`401
CREDENTIALS_MISSING`, während ein formgerechter `AIza…` dort `400
API_KEY_INVALID` bekommt), `generativelanguage.googleapis.com` dagegen schon.
Deshalb ruft `cover-erkennen` seit dem 01.09.2026 Gemini statt Cloud Vision
auf – das sparte einen zweiten Schlüssel samt Cloud-Projekt und Abrechnung
und liefert Interpret und Titel getrennt statt eines unscharfen
`bestGuessLabel`. Ältere Flash-Modelle sind abgekündigt und antworten mit
`404`; verwendet wird `gemini-3.6-flash`.

**Noch zu entscheiden:** beim Cover-Scan verlässt ein Nutzerfoto das Gerät und
geht an Google. Das Projekt vermeidet Google-Fonts ausdrücklich aus diesem
Grund – ein Foto wiegt schwerer als eine IP-Adresse. Der Weg gehört in die
Datenschutzerklärung und sollte eine bewusste Handlung bleiben.

### 2. In-App-Kauf · alles gebaut, es fehlen nur noch Store-Einträge

**Diese Produkt-IDs müssen in beiden Stores zeichengenau so heißen** — die App
fragt genau danach, ein Tippfehler äußert sich nur als „Produkt nicht
gefunden":

```
collectview.plus.monatlich
collectview.plus.jaehrlich
```

Der Weg ist entschieden: **In-App-Kauf bei Apple und Google**. Stripe trägt im
Store-Kontext nicht.

**Fertig und nachgeprüft (01.09.2026):**

- `db/abo.sql`, `db/scan-limit.sql`, `db/collection-limit.sql` sind gelaufen.
- `abo-pruefen` ist deployt, die Apple-Credentials tragen (Sandbox antwortet
  authentifiziert), Google ebenfalls.
- `cordova-plugin-purchase@13.18.0` ist installiert und in beide nativen
  Projekte gesynct. **Beide bauen**: iOS `BUILD SUCCEEDED` (StoreKit verlinkt,
  Klasse `InAppPurchase` in der Binary), Android `BUILD SUCCESSFUL`
  (`billing:9.0.0`).
- `app/js/abo.js` wurde Aufruf für Aufruf gegen die Typdefinitionen von v13
  abgeglichen. Dabei fiel ein echter Fehler auf: `aboWiederherstellen()` las
  den Beleg aus `kauf.transaction`, eine Eigenschaft, die `Product` gar nicht
  hat — Wiederherstellen hätte **immer** versagt. Behoben über
  `store.findInLocalReceipts()`.

**Was noch fehlt, und nur Massimo kann es:**

1. **App Store Connect**: die zwei Abo-Produkte anlegen, mit Preis und
   Lokalisierung, Status mindestens „Ready to Submit".
2. **Sandbox-Tester** unter *Benutzer und Zugriff → Sandbox*, auf dem Gerät
   unter *Einstellungen → App Store → Sandbox-Account* anmelden.
3. **Kauf auf einem echten Gerät.** Ein StoreKit-Configuration-File in Xcode
   reicht **nicht**: lokale Testkäufe existieren auf Apples Servern nicht und
   ergäben bei `abo-pruefen` wieder ein 404.

**Falle beim Testen:** `www/` ist gitignored und wird erzeugt. Wer `app/js/*`
ändert und direkt `npx cap sync` laufen lässt, spielt die alte Fassung aufs
Gerät. Immer `bash scripts/build-www.sh && npx cap sync ios`.

#### `abo-notify` · damit ein Abo auch wieder endet

`abo-pruefen` schaltet frei, wenn der Client einen Beleg schickt. Danach fragte
niemand mehr nach: Wer kündigte, dessen Zahlung scheiterte oder wer sein Geld
zurückbekam, behielt `subscription_status = 'active'` **auf ewig** — und genau
dieses Feld lesen beide Schranken. Es gab keinen Webhook, keinen Cron
(`pg_cron` ist nicht installiert) und keine Prüfung beim App-Start;
`subscription_renews_at` wurde geschrieben, aber von niemandem gelesen.

Die neue Function `abo-notify` nimmt **App Store Server Notifications V2**
entgegen und ruft `abo_setzen` bzw. `abo_beenden`. Sie ist deployt, mit
`--no-verify-jwt` (Apple schickt keinen Supabase-Token; der Schutz ist die
Signatur). In App Store Connect steht als **Sandbox**-URL seit dem
Domain-Umzug:

```
https://collectview.site/apple/abo-notify
```

Dahinter liegt ein Cloudflare Worker (Supabase Custom Domains gibt es erst ab
Pro), der POST unverändert an
`https://mevmpihydpksruhmzzwr.supabase.co/functions/v1/abo-notify`
durchreicht — durchreichen, nicht umleiten: auf eine Weiterleitung darf man
sich hier nicht verlassen. Unabhängig nachgemessen: 0 Redirects, echte
Meldung `200`, drei manipulierte `400`, `GET` `405`, Apples Zustellprotokoll
`SUCCESS`. Dass die signierte Meldung durchgeht, beweist zugleich, dass der
Worker den Rumpf byte-identisch weitergibt.

Auf derselben Domain liegen `/support` und `/datenschutz` — beide verlangt
Apple für die Einreichung.

**Ende zu Ende belegt (01.09.2026):** Apples echte Probemeldung wird
angenommen (`200`, `TEST`), und **Apple selbst verbucht die Zustellung als
`SUCCESS`**. Drei manipulierte Fassungen derselben Meldung werden abgewiesen:
Inhalt auf `EXPIRED` geändert, Signatur verdreht, Kette gekürzt.

**Apples eigene Bibliothek ist hier unbrauchbar** — sie prüft Ketten über
Nodes `crypto.X509Certificate`, und Deno liefert davon nur eine Hülle: weder
`.toString()` noch `.raw` sind implementiert. Die echte Meldung scheiterte
deshalb mit `VERIFICATION_FAILURE`, während dieselbe Meldung lokal unter Node
durchlief. Die Prüfung steht jetzt ausgeschrieben in `abo-notify`, gegen
`@peculiar/x509`. Wer dort etwas ändert: die drei Angriffe von oben gehören
danach erneut durchgespielt.

Bewusst **nicht** beendet wird bei `DID_CHANGE_RENEWAL_STATUS` (Verlängerung
abgeschaltet, Abo läuft bis Periodenende weiter) und `DID_FAIL_TO_RENEW`
(Nachfrist). Das Ende meldet Apple danach als `EXPIRED`.

**Vor dem Launch:** Die Produktions-URL ist absichtlich noch leer. Wenn sie
gesetzt wird, braucht es dort dieselbe Adresse — und `APPLE_SANDBOX_ERLAUBT`
gehört dann auf `false`, sonst schaltet ein Sandbox-Tester echte Abos frei.
Die Apple-ID der App lautet `6807394925`.

**Google fehlt hier noch:** dessen Gegenstück sind Real-time Developer
Notifications über Pub/Sub — anderer Weg, noch nicht gebaut.

### 3. App Store Connect prüfen

Die Bundle-ID ist beim Rebrand von `online.driftware.plattenregal` auf
`online.driftware.collectview` gewechselt. Liegt dort schon ein Eintrag unter
der alten ID, ist das ein **neuer App-Eintrag**, kein Update.

---

## Technisch offen

### Ein Test ist rot — nicht aus der Function-Arbeit

`./test/run.sh`: **1 von 181** schlägt fehl, in `duplikate.test.html`:

```
✗ Listeneintrag trägt das Badge, ohne die Zeile umzubauen
  Klasse der Textliste fehlt – "list-card-plain" nicht enthalten
```

Er war schon vor der Function-Arbeit rot (auf unverändertem `HEAD`
nachgeprüft, 01.09.2026) und gehört zur Sammlungsliste in `ui.js` — also
in den anderen Strang. Vermutlich hat `0726d8d` (Cover-Miniaturen in der
Listenansicht) die Zeile umgebaut, ohne `list-card-plain` mitzunehmen.
Entweder trägt die Zeile die Klasse wieder, oder der Test beschreibt den
alten Aufbau und muss nach.


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
