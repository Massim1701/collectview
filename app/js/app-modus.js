/* =====================================================================
   app-modus.js – "kostenlose App" gegen "Web-App".

   Die native App (iOS/Android, Capacitor) ist ein kostenloser Scanner:
   Sie kennt weder Sammlung noch Marktplatz noch Abo, zeigt keine
   Preise und verlinkt nicht zum Bezahlen. Das Abo (CollectView Plus)
   gibt es nur auf der Webseite, per Stripe.

   Warum so streng: Apple (Richtlinie 3.1.1/3.1.3) und Google lassen
   Funktionen, die man außerhalb der App bezahlt hat, in der App nur zu,
   wenn sie dort auch per In-App-Kauf angeboten werden. Eine App ohne
   bezahlte Funktionen und ohne Zahlungshinweise umgeht den Konflikt.

   Muss VOR ui.js und scanner.js geladen werden. Klassisches Script.

   Zum Ausprobieren im Browser: ?app=1 an die URL hängen (merkt sich die
   Einstellung in dieser Browser-Sitzung), ?app=0 schaltet wieder aus.
   ===================================================================== */

const APP_GRATIS = (() => {
  try {
    const param = new URLSearchParams(location.search).get("app");
    if (param === "1") sessionStorage.setItem("appGratis", "1");
    if (param === "0") sessionStorage.removeItem("appGratis");
    if (sessionStorage.getItem("appGratis") === "1") return true;
  } catch {
    // sessionStorage gesperrt: dann zählt nur die echte Plattform.
  }
  return !!window.Capacitor?.isNativePlatform?.();
})();

if (APP_GRATIS) document.documentElement.dataset.appGratis = "1";

/* Webseite, auf die der Hinweis nach dem Scan verlinkt. Bewusst nur die
   Startseite: kein Preis, kein Kauf-Link (siehe oben, Apple 3.1.1/3.1.3). */
const APP_WEB_URL = "https://collectview.site";

/** Sieht diese Person den Hinweis nach dem Scan? Nicht, solange der Abo-Status
 *  unbekannt ist (sonst blitzt er bei Plus-Konten kurz auf) und nie mit Plus. */
function appHinweisSichtbar({ aboBekannt, subscribed }) {
  return APP_GRATIS && !!aboBekannt && !subscribed;
}

/** Hinweis unter dem Scan-Ergebnis. Neutral: kein Preis, kein Kauf-Link.
 *  Gäste bekommen zusätzlich den Weg zur Anmeldung. */
function appHinweisMarkup(gast) {
  return `
    <div class="notice" style="margin-top:14px;">
      <div class="notice-body">
        <strong>Mehr aus deinen Scans machen</strong>
        <span>Sammlung, Wunschliste und Marktplatz findest du auf CollectView im Web.</span>
        <a class="btn-secondary small" href="${APP_WEB_URL}" target="_blank" rel="noopener">Zu CollectView</a>
        ${gast ? `<span style="margin-top:6px;">Schon ein Konto? <a href="login.html?next=scanner.html">Anmelden</a></span>` : ""}
      </div>
    </div>`;
}
