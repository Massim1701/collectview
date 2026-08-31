/* =====================================================================
   cover-erkennen – Foto einer Plattenhülle, Antwort: was das ist.

   Warum nicht Texterkennung: Tesseract liest Buchstaben. Auf einer
   Plattenhülle steht der Interpret aber oft in verzierter Schrift, quer,
   winzig – oder gar nicht (Led Zeppelin IV trägt keinen einzigen
   Buchstaben). Google Cloud Vision "Web Detection" erkennt stattdessen
   das BILD wieder und liefert ein bestGuessLabel wie
   "abbey road beatles album cover". Genau das ist der Text, mit dem sich
   Discogs sinnvoll befragen lässt.

   Warum serverseitig: der API-Schlüssel ist abrechnungsrelevant. Läge er
   in der ausgelieferten App, könnte ihn jeder auslesen und auf eure
   Rechnung Anfragen stellen.

   Warum "Google Bildersuche" hier nicht steht: für images.google.com
   gibt es keine öffentliche Schnittstelle, und Abgreifen verstößt gegen
   Googles Bedingungen. Web Detection ist der offizielle Weg zur selben
   Auskunft.

   DSGVO-Hinweis, der eine Entscheidung verlangt: hier verlässt ein Foto
   des Nutzers das Gerät und geht an Google. Das Projekt vermeidet
   Google-Fonts ausdrücklich aus diesem Grund (CLAUDE.md). Ein Foto wiegt
   schwerer als eine IP-Adresse – der Cover-Weg gehört deshalb in die
   Datenschutzerklärung und sollte eine bewusste Handlung bleiben, keine
   Hintergrundabfrage.
   ===================================================================== */

const VISION_KEY = Deno.env.get("GOOGLE_VISION_KEY");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST erwartet." }, 405);

  // Kein Schlüssel: ausdrücklich sagen. Die App fällt dann auf die
  // Texterkennung im Browser zurück, statt still nichts zu liefern.
  if (!VISION_KEY) return json({ error: "GOOGLE_VISION_KEY ist nicht gesetzt." }, 503);

  let bild: string;
  try {
    const body = await req.json();
    bild = String(body.bild || "");
  } catch {
    return json({ error: "Ungültiger Rumpf." }, 400);
  }
  if (!bild) return json({ error: "Feld 'bild' (base64, ohne data:-Präfix) wird erwartet." }, 400);

  // Grobe Obergrenze: Vision nimmt bis 20 MB, aber ein Sucherbild ist
  // deutlich kleiner. Alles Größere ist eher ein Fehler als ein Cover.
  if (bild.length > 8_000_000) return json({ error: "Bild zu groß." }, 413);

  let res: Response;
  try {
    res = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${VISION_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [{
          image: { content: bild },
          features: [{ type: "WEB_DETECTION", maxResults: 10 }],
        }],
      }),
    });
  } catch (e) {
    return json({ error: `Vision nicht erreichbar: ${e.message}` }, 502);
  }

  if (!res.ok) {
    const text = await res.text();
    return json({ error: `Vision antwortete mit ${res.status}`, detail: text.slice(0, 300) }, res.status);
  }

  const daten = await res.json();
  const web = daten?.responses?.[0]?.webDetection || {};

  // bestGuessLabel ist Googles eigene Zusammenfassung ("abbey road
  // beatles") und für die Discogs-Suche fast immer der beste Text.
  const label = web.bestGuessLabels?.[0]?.label || "";

  // Die Entitäten als Rückfallebene und zum Anzeigen: wenn das Label
  // danebenliegt, steht der richtige Name oft trotzdem darunter.
  const entitaeten = (web.webEntities || [])
    .filter((e: { description?: string; score?: number }) => e.description && (e.score ?? 0) > 0.3)
    .slice(0, 5)
    .map((e: { description: string; score?: number }) => ({ text: e.description, score: e.score ?? 0 }));

  if (!label && entitaeten.length === 0) {
    return json({ label: "", entitaeten: [], hinweis: "Vision hat das Bild nicht wiedererkannt." });
  }

  return json({ label, entitaeten });
});
