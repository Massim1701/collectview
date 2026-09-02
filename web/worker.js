// Rekonstruktion des Cloudflare-Worker-Quelltexts für collectview-site,
// Stand 02.09.2026 (Claude Web, im Rahmen des Auftrags "Worker-Quelltext
// ins Repo").
//
// WICHTIG - Herkunft ehrlich gekennzeichnet:
//   - Der Routing-Teil (fetch-Handler, /apple/abo-notify-Proxy, /support,
//     /datenschutz, ASSETS-Fallback, exports) ist wortwörtlich aus dem
//     Cloudflare Quick-Edit-Fenster abgelesen (Bildschirmfoto, Zeilen 29-81).
//   - page()/supportHtml()/privacyHtml() sind REKONSTRUIERT aus der live
//     ausgelieferten HTML von /support und /datenschutz (curl, 02.09.2026),
//     nicht aus dem Editor selbst - der Editor lief in einem cross-origin
//     iframe, das sich per Browser-Automation nicht scrollen/fokussieren
//     liess (gleiches Problem wie beim 1970-Bug-Fix). Inhaltlich sollten sie
//     exakt dem entsprechen, was live läuft; Formatierung/Variablennamen im
//     Original können abweichen.
//   - UPSTREAM ist im Editor nicht zu sehen gewesen (Wert nicht bekannt,
//     vermutlich eine Supabase-Edge-Function-URL für abo-notify-google) -
//     als Platzhalter markiert, NICHT raten und NICHT deployen ohne das
//     gegen den echten Wert zu prüfen.
//
// Die Startseite ("/") kommt NICHT aus diesem Skript, sondern aus einem
// Workers-Assets-Binding (env.ASSETS.fetch) - siehe render-landing.mjs.

function page(title, body) {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · CollectView</title><style>
  body{background:#0E0E10;color:#F2F2F0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
    max-width:640px;margin:0 auto;padding:48px 24px;line-height:1.6}
  h1{font-family:'Big Shoulders Display',sans-serif;text-transform:uppercase;letter-spacing:.02em;font-size:40px;margin-bottom:8px}
  h2{font-size:20px;margin-top:32px;color:#C8FF4D}
  a{color:#C8FF4D}
  .brand{color:#C8FF4D;font-weight:800}
  footer{margin-top:48px;font-size:13px;color:#8A8A8E}
</style></head>
<body>
  ${body}
<footer>&copy; 2026 CollectView &middot; <a href="/">Start</a> &middot; <a href="/support">Support</a> &middot; <a href="/datenschutz">Datenschutz</a></footer></body></html>`;
}

const SUPPORT_EMAIL = "supportcollectview.site@gmail.com"; // war: support@collectview.site

function supportHtml() {
  return page("Support", `
  <h1>Support</h1>
  <p>Fragen oder Probleme mit CollectView? Schreib uns:</p>
  <p><a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></p>
  <h2>Häufige Themen</h2>
  <p>Abo-Fragen, Scan-Erkennung, Datenexport &mdash; meld dich einfach per E-Mail, wir antworten so schnell wie möglich.</p>`);
}

function privacyHtml() {
  const stand = new Date().toISOString().slice(0, 10);
  return page("Datenschutz", `
  <h1>Datenschutzerklärung</h1>
  <p><em>Stand: ${stand}</em></p>

  <h2>Verantwortlicher</h2>
  <p>CollectView &middot; Kontakt: <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></p>

  <h2>Konto &amp; Anmeldung</h2>
  <p>Für die Nutzung der App wird ein Konto (E-Mail-Adresse) angelegt. Die Anmeldedaten werden über Supabase Auth verwaltet und verschlüsselt gespeichert.</p>

  <h2>Sammlung &amp; Cover-Suche</h2>
  <p>Bei der Suche nach Alben und Cover-Bildern werden Anfragen an die Discogs-Datenbank weitergeleitet, um Metadaten und Cover anzuzeigen.</p>

  <h2>Cover-Scan</h2>
  <p>Beim Scannen eines Covers per Kamera wird das Foto zur Erkennung an Google (Gemini) übermittelt. Das Foto wird nur für die Erkennung verwendet und nicht dauerhaft bei uns gespeichert.</p>

  <h2>Abo &amp; Kauf</h2>
  <p>Abo-Käufe laufen über Apple bzw. Google. Zur Prüfung eines Kaufs kontaktiert unser Server die jeweilige Store-API (App Store Server API / Play Developer API). Es werden keine Zahlungsdaten von uns verarbeitet oder gespeichert &mdash; das übernimmt vollständig Apple bzw. Google.</p>

  <h2>Keine Werbung, kein Tracking</h2>
  <p>CollectView zeigt keine Werbung und verwendet keine Tracking- oder Analyse-Dienste zu Werbezwecken.</p>

  <h2>Deine Rechte</h2>
  <p>Du kannst jederzeit Auskunft, Berichtigung oder Löschung deiner Daten verlangen &mdash; schreib uns einfach an <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.</p>`);
}

// NICHT verifizierter Platzhalter - vor Deploy gegen den echten Wert prüfen
// (z. B. gegen die Supabase Edge Function "abo-notify-google").
const UPSTREAM = "REPLACE_ME_UPSTREAM_URL";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/apple/abo-notify") {
      if (request.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405 });
      }
      const upstreamResponse = await fetch(UPSTREAM, {
        method: "POST",
        headers: {
          "content-type": request.headers.get("content-type") || "application/json"
        },
        body: request.body
      });
      return new Response(upstreamResponse.body, {
        status: upstreamResponse.status,
        headers: { "content-type": upstreamResponse.headers.get("content-type") || "application/json" }
      });
    }
    if (url.pathname === "/support") return new Response(supportHtml(), { headers: { "content-type": "text/html;charset=utf-8" } });
    if (url.pathname === "/datenschutz") return new Response(privacyHtml(), { headers: { "content-type": "text/html;charset=utf-8" } });
    return env.ASSETS.fetch(request);
  }
};
