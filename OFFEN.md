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

### 1. Edge Functions · alle drei deployt, Apple-Schlüssel blockiert

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

#### Store-Zugangsdaten: Google trägt, Apple nicht

| Store | Stand |
|---|---|
| Google Play | **funktioniert.** Dienstkonto `abo-pruefen@collectview-507309…` holt ein Zugriffstoken (3599 s) mit Scope `androidpublisher`. |
| Apple | **`401`, alle Varianten.** |

Beim Apple-Schlüssel liegt es nicht an der Umsetzung und nicht am Rebrand.
Gegengeprüft am 01.09.2026:

- Die ES256-Signatur ist korrekt — DER→roh zurückgewandelt und mit
  `openssl dgst -verify` bestätigt (`Verified OK`).
- Der private Schlüssel ist ein gültiger 256-Bit-EC-Schlüssel.
- `bid` = `online.driftware.collectview` **und** die alte
  `online.driftware.plattenregal` **und** ganz ohne `bid`: dreimal `401`.
- Sandbox-Endpunkt: ebenfalls `401`.

Auch die App Store **Connect** API (`api.appstoreconnect.apple.com/v1/apps`)
lehnt dasselbe Paar mit `401 NOT_AUTHORIZED` ab. Das schließt die zuerst
naheliegende Erklärung aus: ein Team-Schlüssel müsste dort funktionieren und
nur bei StoreKit scheitern. Das Paar gilt also **nirgends**.

Damit bleiben nur noch Gründe, die im Konto liegen, nicht im Code:

1. `APPLE_ISSUER_ID` gehört zu einem anderen Team als der Schlüssel.
2. Der Schlüssel `4L3Y2HPQU4` ist in App Store Connect widerrufen.
3. Key-ID und `.p8` gehören nicht zusammen — die Datei stammt von einem
   anderen Schlüssel als die eingetragene ID.

Zu prüfen in App Store Connect → *Benutzer und Zugriff* → *Integrationen*:
existiert `4L3Y2HPQU4` dort noch und ist aktiv, auf welcher Registerkarte
steht er, und ist die Issuer-ID **von derselben Registerkarte** übernommen?
Für die App Store Server API muss es ein Schlüssel der Registerkarte
**In-App-Kauf** sein.

**Was den `401` nicht erklärt:** App-Store-Metadaten. Screenshots,
Beschreibung und ein angehängter Build spielen für die Server-API keine
Rolle — die authentifiziert allein über den signierten JWT, vor jedem
Zugriff auf einen App-Datensatz. Ein unvollständiger App-Eintrag ergäbe
`404`, nicht `401`.

Bis dahin: Google-Käufe würden durchlaufen, Apple-Käufe scheitern mit
`502 Beleg konnte nicht geprüft werden`.

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
