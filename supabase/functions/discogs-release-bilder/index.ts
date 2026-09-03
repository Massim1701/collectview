/* =====================================================================
   discogs-release-bilder – Proxy für ein einzelnes Discogs-Release, nur
   um an Vorder- und Rückseiten-Cover zu kommen (images[].type: "primary"
   ist die Vorderseite, das erste "secondary" meist die Rückseite – das
   ist Discogs-Konvention, keine Garantie, aber trifft in der Praxis fast
   immer zu).

   Wird nur beim Erstellen eines Marktplatz-Beitrags aus der eigenen
   Sammlung heraus aufgerufen (app/listing-new.html), nicht bei jedem
   Scan – die Suche (discogs-suche) liefert das Cover für die Sammlung
   ohnehin schon mit, ein zweiter Request pro Scan wäre unnötig teuer.
   Selber Token, selbes Rate-Limit-Konto wie discogs-suche.
   ===================================================================== */

const DISCOGS_TOKEN = Deno.env.get("DISCOGS_TOKEN");
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
    return json({ error: "DISCOGS_TOKEN ist nicht gesetzt." }, 503);
  }

  const url = new URL(req.url);
  const releaseId = url.searchParams.get("id");
  if (!releaseId || !/^\d+$/.test(releaseId)) {
    return json({ error: "id (numerische Discogs-Release-ID) wird erwartet." }, 400);
  }

  let res: Response;
  try {
    res = await fetch(`https://api.discogs.com/releases/${releaseId}`, {
      headers: {
        "Authorization": `Discogs token=${DISCOGS_TOKEN}`,
        "User-Agent": USER_AGENT,
      },
    });
  } catch (e) {
    return json({ error: `Discogs nicht erreichbar: ${e.message}` }, 502);
  }

  if (res.status === 429) return json({ error: "Rate-Limit" }, 429);
  if (!res.ok) return json({ error: `Discogs antwortete mit ${res.status}` }, res.status);

  const daten = await res.json();
  const images = Array.isArray(daten.images) ? daten.images : [];
  const front = images.find((img: any) => img.type === "primary") || images[0] || null;
  const back = images.find((img: any) => img.type === "secondary" && img !== front) || null;

  return json(
    {
      front: front?.resource_url || front?.uri || null,
      back: back?.resource_url || back?.uri || null,
    },
    200,
    // Ein Release ändert seine Bilder praktisch nie – ruhig lange cachen.
    { "Cache-Control": "public, max-age=3600" },
  );
});
