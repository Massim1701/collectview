# Offene Punkte

Diese Datei ist die einzige verbindliche Liste. **Vor jeder Übergabe lesen,
nach jedem Zug aktualisieren.**

Sie existiert, weil drei Übergaben hintereinander „`db/rollen.sql` gegen die
DB abgleichen" verlangten, obwohl das längst erledigt war: die Listen lagen
in `~/Downloads/*.md`, wo die jeweils andere Sitzung sie nicht sehen konnte.
Beide Sitzungen sehen den Code — also gehört die Liste in den Code.

Stand: 02.09.2026

## Wer ist woran — Kurzfassung

Stand 02.09.2026, nachmittags. Jede Zeile ist nachgemessen, nicht übernommen.

| | |
|---|---|
| **Massimo, jetzt** | **Sandbox-Kauf auf dem iPhone.** Alles dafür steht: Produkt-IDs passen zum Store, iOS-Build `BUILD SUCCEEDED`, Sandbox-Tester angelegt. Das ist der einzige Schritt, bei dem die Abo-Kette noch nie am Stück gelaufen ist. |
| **Massimo, danach** | Scanner, Kamera und Barcode auf einem echten Android-Gerät (bisher nur Emulator, der hat keine Kamera). |
| **Cloudflare `collectview-site`** | **Der einzige offene Baustellenrest.** Drei Seiten tragen noch `support@collectview.site` (`/`, `/support`, `/datenschutz`), und die Startseite verlinkt das Impressum nicht — nachgemessen, unverändert. `/support` und `/datenschutz` gingen über Quick Edit, ein Deploy ist bisher nicht angekommen (Quelltext unverändert: 6× alte Adresse). `/` braucht zusätzlich `wrangler deploy`, weil die Seite aus dem Assets-Binding kommt. Webs vorbereitete Dateien liegen jetzt im Repo (`web/`), damit ist der Weg frei. |
| **Claude Code** | Nichts offen. Zuletzt: Produkt-IDs je Store (`f93841d`), Feedback-Mails laufen, Passwort-vergessen entsperrt, Impressum live mit richtigem Formular-Ziel. |
| **Claude Web** | Nichts offen. Play-Preise gesetzt und gegengeprüft, `1970`-Datum behoben, formsubmit-Endpunkt korrigiert, Worker rekonstruiert. |
| **Erst kurz vor dem Launch** | `APPLE_SANDBOX_ERLAUBT` auf `false`. Apples Produktions-Notification-URL setzen. Alten Schlüssel `4L3Y2HPQU4` widerrufen. Jahresabo bei Apple anlegen — es existiert dort nicht, die App bietet es auf iOS deshalb gar nicht erst an. |

**Erledigt seit heute Mittag, damit es niemand erneut aufgreift:** Tabelle
`feedback` angelegt (sie fehlte komplett, jede Rückmeldung wäre abgeprallt),
Feedback-Mails Ende zu Ende bestätigt, Supabase-Redirect-URLs für
Passwort-vergessen, Impressum-Formular auf die richtige Adresse, Cover in
Liste und Detailseite, Produkt-IDs an App Store Connect angeglichen. Der
gesamte Arbeitsbaum ist versioniert — vorher lagen Dateien dreier Sitzungen
unversioniert nebeneinander.

Alles Weitere in dieser Datei ist Begründung und Beleg zu diesen Punkten.

---

## Braucht Massimo — niemand sonst kommt da ran

### 1. Edge Functions · fünf deployt, beide Stores tragen

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
| Google Play | **funktioniert, jetzt wirklich.** Der `subscriptions`-Aufruf antwortet `200` und listet beide Produkte. Bis zum 01.09.2026 stand hier „funktioniert", belegt mit einem geholten Zugriffstoken — das war wertlos: Google stellt das Token immer aus, auch wenn die API im Projekt abgeschaltet ist. Sie war es (`403 SERVICE_DISABLED`), inzwischen freigeschaltet. **Ein Token ist kein Zugang; erst ein echter Aufruf zählt.** |
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

#### `abo-notify-google` · dasselbe für Play

Gebaut und deployt (`--no-verify-jwt`). Der Bau ist **einfacher** als bei
Apple, und zwar aus einem Grund, der im Code steht: Apple signiert seine
Meldungen, der Inhalt ist damit die Wahrheit — deshalb dort eine Tabelle,
welche Meldung was bedeutet. Google signiert den Inhalt **nicht**; die
Meldung sagt nur „an diesem Kauf hat sich etwas geändert". Also fragen wir
danach die Play Developer API und richten uns nach deren Antwort. Googles
dreizehn Ereignistypen kommen deshalb im Code gar nicht vor — keiner davon
trifft eine Entscheidung. Nebeneffekt: eine erfundene Meldung erreicht
nichts, sie führt nur dazu, dass wir bei Google nachfragen und den wahren
Zustand hinschreiben.

Die Play-Abfrage liegt in `supabase/functions/_shared/google-play.ts` —
seit dem 02.09.2026 benutzen sie **beide** Functions, `abo-pruefen`
eingeschlossen. Zwei Kopien derselben Entscheidung driften auseinander, und
das ausgerechnet an der Stelle, die bestimmt, wer ein Abo hat. Beim
Zusammenführen ist auch der RS256-Zweig aus `signiereJwt()` verschwunden:
den brauchte nur Google, seitdem gab es keinen Aufrufer mehr.

Nachgeprüft: `GET` → `405`; leerer Rumpf → `400`; Probemeldung → `200`;
fremder `packageName` → `400`; unbekannter Kauf-Token → `200 kein Profil`.
Die Autorisierung wurde mit einem vorübergehend gesetzten
`GOOGLE_PUBSUB_AUDIENCE` geprüft: ohne Token `401`, mit gefälschtem Token
`401` (Log: `kid unbekannt` — Googles echte Schlüsselliste wurde geholt).
Der Testschalter ist wieder entfernt.

**Scharf geschaltet und Ende zu Ende bestätigt (Web, 01./02.09.2026):**
Pub/Sub-Topic steht, Play Console meldet dorthin, das Push-Abo liefert mit
OIDC-Token, und eine Probemeldung aus der Play Console ist in den
Function-Logs angekommen. `GOOGLE_PUBSUB_EMAIL` **ist gesetzt** (am
02.09.2026 in den Secrets nachgeprüft) — die Function erzwingt die
Autorisierung also wirklich und nimmt nicht mehr jede Zustellung an.

Die Google-Seite ist damit vollständig: Produkte aktiv, App hochgeladen,
Meldungen laufen. Offen bleibt dort allein der Preis, siehe 2b.

### 2b. Preise · die App zeigte einen anderen Preis, als der Store abbucht

**Gefunden am 01.09.2026:** `wireframes/pricing.html` hatte `3,99 €` und
`34,90 €` fest eingetragen. Die Play-API meldet für Deutschland aber
`4,79 €` und `41,99 €` — vermutlich netto eingetragen, brutto abgerechnet
(3,99 × 1,19 ≈ 4,75, von Google auf 4,79 gerundet). Der Kunde hätte also
mehr gezahlt, als in der App stand. Das fällt in der Review auf.

Dazu: feste Preise können in **173 Regionen** gar nicht stimmen — ein Kunde
in Japan sah „3,99 €".

**Behoben, was den Code angeht:** Die Preisseite nimmt den Preis jetzt vom
Store (`storePreise()` in `app/js/abo.js`), samt Währung und Steuer des
jeweiligen Landes. Die festen Werte sind nur noch Platzhalter für den
Browser, wo es keinen Store gibt. Der Monatsäquivalent-Text wird aus dem
Jahrespreis gerechnet (`monatsAequivalent()`, drei Tests).

**Entschieden:** Der Kunde soll **3,99 €** zahlen.

**Erledigt (02.09.2026):** Play-Preise auf `3,99 €` (monatlich-autorenew) und
`34,90 €` (jaehrlich-autorenew) für DE gesetzt, über die Play Developer API
gegengeprüft (`GET .../subscriptions`, `regionalConfigs` für `DE`):
`monatlich-autorenew` 3.99 EUR, `jaehrlich-autorenew` 34.90 EUR, beide `state:
ACTIVE`. Apple-Produkte sind noch nicht angelegt — das bleibt bei Massimo /
App Store Connect direkt, nicht bei Claude Web (Kontoerstellung/Store-Produkte
fallen unter die Ausnahme für Store-seitige Aktionen).

### 3. App Store Connect · Eintrag steht, Produkte fehlen

Der App-Eintrag **existiert** (nachgesehen am 01.09.2026): CollectView,
Apple-ID `6807394925`, Bundle-ID `online.driftware.collectview`, Status
„1.0 Prepare for Submission". Die Frage von damals — ob der Rebrand einen
neuen Eintrag nötig macht — ist damit erledigt.

Die Apple-ID `6807394925` wird gebraucht, sobald Produktions-Notifications
laufen; Apples Prüfung verlangt sie für die Produktionsumgebung.

**Offen dort:** die zwei Abo-Produkte und ein Sandbox-Tester (siehe 2).

---

## Technisch offen

### ~~`/datenschutz` zeigt 1970~~ — erledigt am 02.09.2026

`https://collectview.site/datenschutz` schreibt „Stand: 1970-01-01" und im
Fuß „© 1970 CollectView". Ursache gefunden (02.09.2026): `SUPPORT_HTML` und
`PRIVACY_HTML` im Cloudflare Worker (`collectview-site`, Quick Edit, nicht in
diesem Repo) sind `var`-Konstanten, die `page(...)` beim Cold-Start des
Workers einmalig aufrufen — Cloudflare liefert `new Date()` bei diesem
einmaligen Modul-Load als Unix-Nullpunkt. Fix: beide zu Funktionen machen
(`function supportHtml() { return page(...) }` /
`function privacyHtml() { return page(...) }`), damit `page()` erst pro
Request läuft, plus die zwei `fetch()`-Zeilen (`/support`, `/datenschutz`)
entsprechend auf `supportHtml()` / `privacyHtml()` umstellen.

**Deployt und live geprüft (02.09.2026).** Direkt-Edit per Browser-Automation
ist an einer unsauberen Zwischenfassung hängen geblieben (Sicherheitsfilter
blockierte den Korrekturversuch); Massimo hat den fertigen Fix-Text danach
selbst im Cloudflare Quick Edit eingefügt und deployt. Live nachgeprüft:
`/datenschutz` zeigt `Stand: 2026-09-02` und Footer `© 2026 CollectView`,
`/support` ebenso `© 2026`, `/` lädt weiterhin normal über `env.ASSETS.fetch`.

Nicht kosmetisch: Apple liest die Datenschutzerklärung in der Review, und
Web hat sie am 01.09.2026 veröffentlicht. Inhaltlich ist sie gut — sie
benennt ausdrücklich, dass beim Cover-Scan ein Foto an Google (Gemini) geht.
Damit ist die frühere offene Frage „gehört der Weg in die
Datenschutzerklärung" beantwortet.

### Akzentfarbe für Plus — fortgesetzt am 02.09.2026

Übernommen aus `60f835b` (siehe Commit-Text oben): Plus-Abonnenten können
das feste Neongrün durch eine von sechs Farben ersetzen. `db.js`,
`auth.js`, `styles.css` waren beim Übernehmen bereits fertig und
unverändert richtig — nur `db/accent-color.sql` hatte eine Lücke.

**Gefunden:** Der Trigger blockierte nur das *Setzen* einer Farbe ohne
aktives Abo. Er lief lediglich `before insert or update of accent_color` —
`abo_beenden()` (db/abo.sql) ändert aber nur `subscription_status`, nie
`accent_color`. Eine einmal gesetzte Farbe blieb also nach Kündigung
einfach stehen, und der Client zeigt sie ungeprüft weiter an
(`applyAccentColor()` in `auth.js` fragt nicht nach `subscription_status`).
Ein gekündigter Nutzer wäre optisch weiter als Plus durchgegangen — genau
das, was der Kommentar in der SQL-Datei ausdrücklich vermeiden wollte.

**Fix:** Trigger feuert jetzt auch `before update of subscription_status`
und setzt `accent_color` auf `null`, sobald der Status von `active`
wegwechselt — unabhängig davon, wer schreibt (die alte
`service_role`-Ausnahme ist damit weg, da sie das Aufräumen beim
Kündigen sonst verhindert hätte).

**Angewandt und geprüft (02.09.2026):** Migration über die Management-API
gegen `mevmpihydpksruhmzzwr` gelaufen, Spalte/Constraint/Trigger stehen.
Verhalten an einer isolierten Testtabelle (keine echten Profile berührt)
durchgespielt: aktiv + Farbe → bleibt; Abo läuft aus → Farbe wird
automatisch `null`; Farbe setzen ohne aktives Abo → bleibt `null`; wieder
aktiv + Farbe im selben Update → funktioniert. Bestehende Profile
gegengeprüft: 0 mit verwaister Farbe (`accent_color` gesetzt bei nicht
aktivem Abo) — nichts nachzuräumen.

**Uncommittet, wie der Rest von `60f835b`.** `db/accent-color.sql` ist im
Baum geändert, nicht committet, nicht gepusht. Massimo: weitermachen
bedeutet aus meiner Sicht als Nächstes — Sichtprüfung mit einem echten
Plus-Testkonto (die Farbpunkte in der Kontozeile auf `home.html` /
`scanner.html`) und danach committen, wenn sie so bleiben soll.

### ~~Ein Test ist rot~~ — erledigt am 01.09.2026

`./test/run.sh`: **182 von 182 grün.**

Die Beschreibung hier war in zwei Punkten falsch und hat in die Irre
geführt: Der Test steht nicht in `duplikate.test.html` (die Datei gibt es
nicht), sondern in `test/quantity.test.html`. Und `list-card-plain` ist
nicht verlorengegangen — die Klasse ist ein Modifikator für Listen **ohne**
Cover und wird weiterhin von `admin.js` benutzt.

Richtig war nur der Verdacht auf `0726d8d`: seit den Cover-Miniaturen trägt
`plainListRowMarkup()` die Klasse `list-card` und rendert eine 44px-Miniatur.
Das war Absicht. Der Test beschrieb den Aufbau davor — er hat nichts
gefunden, sondern nur nicht mitbekommen, dass die Zeile bewusst umgebaut
wurde.

Nachgezogen. Dabei ist eine wertlose Zusicherung durch eine echte ersetzt
worden: `assert(!html.includes("<img"))` hielt nur deshalb, weil der
Testeintrag zufällig kein Cover hatte — mit Cover wäre sie umgefallen.
Geprüft wird jetzt, dass die Miniatur `loading="lazy"` trägt. Das ist die
Zusicherung, auf die es ankommt: eine Sammlung mit 400 Platten soll beim
Öffnen nicht 400 Cover holen.

### ~~Cover blieben grau~~ — erledigt am 01.09.2026

Beide Einträge in der Sammlung zeigten nur den Platzhalter. Ursache war
**nicht** die Cover-Erkennung, sondern das Datum: sie wurden am 31.08.2026
angelegt, einen Tag bevor `discogs-suche` Bilder lieferte (vorher 0 von 50).
`cover_url` wurde deshalb als `NULL` gespeichert — und das Cover wird nur
beim Hinzufügen mitgeschrieben, niemand trägt es je nach. Die Einträge
wären dauerhaft grau geblieben, obwohl das Bild bei Discogs längst liegt.

`scripts/cover-nachtragen.mjs` holt fehlende Cover über die `discogs_id`
nach. Ohne Argument zeigt es nur an, mit `--schreiben` füllt es — und zwar
nur `NULL`-Felder, ein vorhandenes Bild wird nie überschrieben. Beide
Einträge haben jetzt ein Cover, die URLs liefern `200`.

Das Skript bleibt nützlich: dieselbe Lücke entsteht bei jedem Eintrag neu,
den Discogs gerade ohne Bild führt.

**Merkposten für die Fehlersuche:** `coverMarkup()` trägt
`onerror="this.remove()"`. Ein Cover, dessen URL nicht lädt, sieht damit
exakt aus wie eines, das nie gesetzt wurde. Wer graue Kacheln sucht, muss
beide Fälle unterscheiden — erst in der Datenbank nachsehen, dann die URL
abrufen. **Und einen dritten Fall gibt es auch:** geladen, aber unsichtbar.

### ~~Großes Cover fehlte auf der Detailseite~~ — erledigt am 02.09.2026

In der Liste erschienen die Miniaturen, auf der Detailseite blieb das große
Cover leer. Ursache war `loading="lazy"` am Hero-Bild. Das Bild startet mit
`opacity:0` und wird erst durch die Klasse `loaded` sichtbar; `render()`
läuft auf der Detailseite zweimal (vor und nach dem Discogs-Abruf), und beim
zweiten Mal stellte der Browser das verzögerte Laden zurück und holte es nie
nach. Kein Fehler, kein Platzhalter, kein Hinweis — nur eine leere Fläche.

Im Browser nachgestellt und gemessen: mit `lazy` bleibt `complete=false` und
`opacity:0`, ohne `lazy` lädt das Bild und wird sichtbar. `coverMarkup()`
kennt jetzt `{ lazy: false }`, die Detailseite benutzt es. Die Liste bleibt
lazy — dort ist es richtig. Zwei Tests halten beide Seiten fest.

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

- **Google Play ist vollständig.** Beide Abo-Produkte angelegt und aktiv
  (Basis-Abos `monatlich-autorenew`, `jaehrlich-autorenew`, 173 Regionen),
  App Bundle gebaut, signiert und in die Play Console hochgeladen,
  Real-time Developer Notifications Ende zu Ende bestätigt. Nur der Preis
  stimmt noch nicht, siehe 2b — das ist eine Zahl, kein Aufbau.
- **Apples Server Notifications laufen** über `https://collectview.site/apple/abo-notify`;
  Apple verbucht die Zustellung selbst als `SUCCESS`. Nicht erneut aufsetzen.
- **`cordova-plugin-purchase` ist installiert** und in beiden nativen
  Projekten; iOS und Android bauen damit.

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

---

### Konto-Menü + Passwort vergessen — neu, 02.09.2026

Wunsch von Massimo (Screenshots + Text): die grosse Konto-Karte im
Seitenfluss (Avatar, Name, E-Mail, Sprache, Admin-Button, Ändern-Button)
raus, Funktion stattdessen über das kleine Avatar-Icon oben rechts als
Menü/Dialog. Zusätzlich ein "Passwort vergessen"-Feld auf der Login-Seite,
"Standardverfahren" — also Supabase-eigener E-Mail-Reset-Flow.

**Umgesetzt (Code, uncommittet):**
- `app/js/auth.js`: `requestPasswordReset(email)` (ruft
  `sb.auth.resetPasswordForEmail` mit `redirectTo` auf
  `reset-password.html`), `ensureAccountDialog()` + `wireAccountMenu(btn,
  user)` — natives `<dialog>`, gleiches Muster wie das Feedback-Dialog.
  `renderAccountRow()` bekommt zusätzlich einen Abmelden-Button.
- `app/index.html`, `app/scanner.html`: alte `#konto`-Sektion/Karte entfernt,
  Avatar im Topbar ist jetzt ein Button (`#account-menu-btn`), öffnet den
  Dialog.
- `app/js/home.js`, `app/js/scanner.js`: rufen `wireAccountMenu(...)` statt
  der alten `renderAccountRow(#account-card, ...)`. `home.js` öffnet den
  Dialog automatisch, wenn die Seite mit `#konto` aufgerufen wird (der
  bestehende Eintrag in der unteren Navigation zeigt weiter dorthin).
- `app/app.css`: `.account-dialog` / `.account-dialog-head` / `.icon-close`
  ergänzt.
- `app/login.html`, `app/js/login.js`: Link "Passwort vergessen?" unter dem
  Passwortfeld, ruft `requestPasswordReset(email)`.
- **Neu:** `app/reset-password.html` + `app/js/reset-password.js` — eigene
  Seite, hört auf `PASSWORD_RECOVERY`/vorhandene Session, setzt per
  `sb.auth.updateUser({password})` das neue Passwort, leitet danach auf
  `index.html` weiter.

Alle Dateien mit `node --check` geprüft, syntaktisch ok.

**Noch offen:**
- Im Supabase-Dashboard unter Authentication → URL Configuration muss
  `https://collectview.site/app/reset-password.html` in die "Additional
  Redirect URLs" eingetragen werden — sonst wird `redirectTo` beim
  E-Mail-Reset ignoriert bzw. abgelehnt.
- Live-Test des kompletten Reset-Flows (E-Mail wirklich abschicken/öffnen)
  ist von hier aus nur eingeschränkt möglich — bitte einmal selbst
  durchklicken.
- Wie bei Akzentfarbe: alles uncommittet im Arbeitsbaum, kein `git push`.

---

### Rückmeldung an Claude Code — Auftrag 02.09.2026 (Claude Web)

1. **Startseite neu ausspielen**: NICHT gemacht. `/` kommt aus einem
   Workers-Assets-Binding (`env.ASSETS.fetch`, siehe Bindings-Tab), das
   Quick Edit nicht bearbeiten kann — nur `wrangler deploy` aus dem
   lokalen Worker-Projekt (Versionshistorie: bisherige Deploys liefen als
   "Wrangler by welove80sde", also von Massimos Rechner). Fertig
   vorbereitet in `web/collectview-site-index.html` +
   `web/render-landing.mjs` (Ableitungsschritt aus
   `wireframes/landing.html`, korrigierte Footer-Links). Massimo muss das
   selbst deployen.
2. **E-Mail-Adresse ersetzt**: noch nicht — erneut versucht (02.09.2026,
   zweiter Anlauf auf Massimos Wunsch "Cloudflare machst du alleine").
   Editor lädt diesmal sichtbar (Code lesbar), aber Klicks/Tastatur/JS
   erreichen den Monaco-Editor weiterhin nicht — Cross-Origin-iframe,
   von der Browser-Automation aus nicht ansprechbar (bestätigt: Cursor
   bewegt sich nicht, `document.querySelectorAll('iframe')` zeigt
   Cross-Origin-Frames ohne Zugriff auf `contentDocument`). Nach
   mehreren Versuchen abgebrochen statt festgebissen. Bleibt bei
   Massimo: Ctrl+H im Cloudflare Quick Edit, `support@collectview.site`
   → `supportcollectview.site@gmail.com`, Replace All, Deploy. Auf `/`
   (Startseite) hängt die Adresse zusätzlich vom Assets-Redeploy ab
   (siehe Punkt 1).
3. **Worker-Quelltext im Repo**: `web/collectview-site-worker.js` (Herkunft
   verifiziert vs. rekonstruiert im Dateikopf dokumentiert, `UPSTREAM` als
   nicht verifizierter Platzhalter markiert — vor Deploy prüfen),
   `web/render-landing.mjs`, `web/collectview-site-index.html`,
   `web/README.md`. Alles nur im Arbeitsbaum, nicht committet (Repo
   gehört Claude Code).
4. **formsubmit.co**: erledigt (02.09.2026). Massimo hat den neuen
   Endpunkt auf `supportcollectview.site@gmail.com` aktiviert — per
   Test-POST verifiziert (kein "Check Your Email" mehr, echte
   Formular-Antwort kommt zurück). `web/collectview-impressum.js` Zeile 65
   ist umgestellt: `action="https://formsubmit.co/supportcollectview.site@gmail.com"`
   (Klartext-Adresse statt Hash — den Hash zeigt nur die
   Aktivierungsmail selbst, die Claude Web nicht lesen kann; formsubmit
   erlaubt Klartext ausdrücklich, nur weniger privat). Für
   `FEEDBACK_MAIL_URL`: dieselbe URL,
   `https://formsubmit.co/supportcollectview.site@gmail.com`, POST mit
   Formulardaten (kein JSON-Endpunkt). Nur im Arbeitsbaum geändert, nicht
   committet.
