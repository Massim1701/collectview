/* =====================================================================
   collectview-impressum – Cloudflare Worker, liefert allein /impressum.

   Warum ein eigener Worker: Die übrigen Seiten (/, /support,
   /datenschutz und der Proxy /apple/abo-notify) liegen im Worker
   "collectview-site". Dessen Quelltext war von hier aus nicht lesbar,
   und blind in eine laufende Produktionsseite zu schreiben verbietet
   sich. Cloudflare wählt bei zwei passenden Routen die genauere:
   "collectview.site/impressum" gewinnt gegen "collectview.site/*",
   deshalb greift dieser Worker nur für die eine Seite.

   Route: collectview.site/impressum -> collectview-impressum
   Rückgängig zu machen, indem man genau diese Route löscht.

   Diese Datei ist die Quelle der Wahrheit. Wer die Seite ändert, ändert
   sie hier und spielt sie dann ein – sonst existiert der Stand wieder
   nur bei Cloudflare.

   Offen und bewusst so gelassen:
   - Die ladungsfähige Anschrift steht NICHT auf der Seite, sondern der
     Satz "wird auf Anfrage mitgeteilt" – wie auf driftware.online. Für
     eine geschäftsmäßige Seite verlangt § 5 DDG die Anschrift; das ist
     Massimos Entscheidung, nicht meine.
   - Kontaktformular (02.09.2026 korrigiert): eigener formsubmit-Endpunkt
     auf supportcollectview.site@gmail.com, aktiviert von Massimo. Läuft
     über die Klartext-Adresse in der Formular-action, nicht über einen
     Hash — den Hash hätte nur die Aktivierungsmail selbst gezeigt, die
     Claude Web nicht lesen kann (kein Gmail-Zugriff auf dieses
     Postfach). Klartext-Adresse ist bei formsubmit ausdrücklich
     erlaubt, nur weniger privat (steht im Seitenquelltext).
   ===================================================================== */

const SEITE = `<!doctype html>
<html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Impressum &middot; CollectView</title><style>
  body{background:#0E0E10;color:#F2F2F0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
       max-width:640px;margin:0 auto;padding:48px 24px;line-height:1.6}
  h1{font-family:'Big Shoulders Display',sans-serif;text-transform:uppercase;letter-spacing:.02em;font-size:40px;margin-bottom:8px}
  h2{font-size:20px;margin-top:32px;color:#C8FF4D}
  a{color:#C8FF4D}
  .brand{color:#C8FF4D;font-weight:800}
  footer{margin-top:48px;font-size:13px;color:#8A8A8E}
  .hinweis{font-size:14px;color:#8A8A8E;border-left:2px solid #2A2A2E;padding-left:14px}
  form{margin-top:16px}
  label{display:block;margin-bottom:14px}
  label span{display:block;font-size:14px;color:#8A8A8E;margin-bottom:6px}
  input,textarea{width:100%;box-sizing:border-box;background:#17171A;color:#F2F2F0;
                 border:1px solid #2A2A2E;border-radius:10px;padding:11px 13px;font:inherit}
  input:focus,textarea:focus{outline:2px solid #C8FF4D;outline-offset:1px;border-color:transparent}
  textarea{min-height:130px;resize:vertical}
  button{background:#C8FF4D;color:#0E0E10;border:0;border-radius:10px;padding:12px 22px;font:inherit;font-weight:700;cursor:pointer}
  .honey{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}
</style></head><body>
<p><a href="/">&larr; Zur&uuml;ck zu CollectView</a></p>
<h1>Impressum</h1>
<h2>Angaben gem&auml;&szlig; &sect; 5 DDG</h2>
<p>Massimo Manca</p>
<p class="hinweis">Vollst&auml;ndiger Name und ladungsf&auml;hige Anschrift werden auf Anfrage &uuml;ber das Kontaktformular unten mitgeteilt.</p>
<h2>Kontakt</h2>
<p>E-Mail: <a href="mailto:supportcollectview.site@gmail.com">supportcollectview.site@gmail.com</a></p>
<h2>Verantwortlich f&uuml;r den Inhalt nach &sect; 18 Abs. 2 MStV</h2>
<p>Driftware.online</p>
<h2>Hinweis</h2>
<p>CollectView ist eine Projektarbeit. Dieses Projekt steht zum Verkauf.</p>
<h2>Kontaktformular</h2>
<form method="POST" action="https://formsubmit.co/supportcollectview.site@gmail.com">
  <input type="hidden" name="_subject" value="CollectView &mdash; neue Kontaktanfrage">
  <input type="hidden" name="_template" value="table">
  <input type="hidden" name="_next" value="https://collectview.site/impressum">
  <input type="text" name="_honey" class="honey" tabindex="-1" autocomplete="off" aria-hidden="true">
  <label><span>Name</span><input type="text" name="name" required></label>
  <label><span>Deine E-Mail-Adresse</span><input type="email" name="email" required></label>
  <label><span>Nachricht</span><textarea name="message" required></textarea></label>
  <button type="submit">Senden</button>
</form>
<footer>&copy; 2026 <span class="brand">CollectView</span> &middot; <a href="/">Start</a> &middot; <a href="/support">Support</a> &middot; <a href="/datenschutz">Datenschutz</a> &middot; <a href="/impressum">Impressum</a></footer>
</body></html>`;

export default {
  async fetch(request) {
    const pfad = new URL(request.url).pathname;
    if (pfad === "/impressum" || pfad === "/impressum.html") {
      return new Response(SEITE, {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
      });
    }
    return new Response("Nicht gefunden", { status: 404 });
  },
};
