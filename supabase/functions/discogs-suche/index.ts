/* =====================================================================
   discogs-suche – Proxy für die Discogs-Suche.

   Warum überhaupt: Discogs liefert Cover-Bilder (thumb, cover_image)
   ausschließlich an authentifizierte Anfragen. Ohne Token kommen beide
   Felder als leerer String zurück – gemessen an einer Testabfrage:
   50 Treffer, 50 davon ohne cover_image. Die App zeigt deshalb seit
   jeher nur den generierten Platzhalter (app/js/ui.js, coverMarkup).

   Warum nicht einfach den Token in die App: app/ ist statisches HTML,
   das unverändert an jedes Gerät ausgeliefert wird. Ein Token dort wäre
   für jeden lesbar, der die Entwicklerwerkzeuge öffnet – und Discogs
   sperrt bei Missbrauch den Token, nicht den Missbraucher. Er liegt
   deshalb hier als Secret und verlässt den Server nie.

   Nebengewinn: mit Token hebt Discogs das Limit von 25 auf 60 Anfragen
   pro Minute, und es zählt gegen den Token statt gegen die IP des
   Nutzers. Damit entschärft sich der Fall, für den scanner.js den
   Rate-Limit-Hinweis gebaut hat: mehrere Nutzer im selben WLAN teilen
   sich heute ein Kontingent.
   ===================================================================== */

const DISCOGS_TOKEN = Deno.env.get("DISCOGS_TOKEN");

// Discogs verlangt einen aussagekräftigen User-Agent und weist Anfragen
// mit einem generischen ab.
const USER_AGENT = "CollectView/0.1 +https://github.com/collectview";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, ...extra, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  if (!DISCOGS_TOKEN) {
    // Kein Token gesetzt: ausdrücklich sagen statt still ohne Cover
    // zu antworten. Die App fällt dann auf den Direktweg zurück.
    return json({ error: "DISCOGS_TOKEN ist nicht gesetzt." }, 503);
  }

  const url = new URL(req.url);
  const barcode = url.searchParams.get("barcode");
  const q = url.searchParams.get("q");
  if (!barcode && !q) {
    return json({ error: "barcode oder q wird erwartet." }, 400);
  }

  // Nur die beiden Suchparameter durchreichen, nichts sonst: der Proxy
  // soll keine beliebigen Discogs-Endpunkte offenlegen.
  const ziel = new URL("https://api.discogs.com/database/search");
  if (barcode) ziel.searchParams.set("barcode", barcode);
  if (q) ziel.searchParams.set("q", q);
  ziel.searchParams.set("type", "release");

  let res: Response;
  try {
    res = await fetch(ziel, {
      headers: {
        "Authorization": `Discogs token=${DISCOGS_TOKEN}`,
        "User-Agent": USER_AGENT,
      },
    });
  } catch (e) {
    return json({ error: `Discogs nicht erreichbar: ${e.message}` }, 502);
  }

  // 429 unverändert weiterreichen: scanner.js erkennt den Status und
  // zeigt seinen eigenen Hinweis, statt einen Fehler zu melden.
  if (res.status === 429) return json({ error: "Rate-Limit" }, 429);
  if (!res.ok) return json({ error: `Discogs antwortete mit ${res.status}` }, res.status);

  const daten = await res.json();
  return json(daten, 200, {
    // Derselbe Barcode liefert tagelang dieselbe Antwort. Eine Minute
    // Cache im CDN nimmt Mehrfachscans desselben Regals vom Kontingent.
    "Cache-Control": "public, max-age=60",
  });
});
