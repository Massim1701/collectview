/* =====================================================================
   cover-erkennen – Foto einer Plattenhülle, Antwort: was das ist.

   Warum nicht Texterkennung: Tesseract liest Buchstaben. Auf einer
   Plattenhülle steht der Interpret aber oft in verzierter Schrift, quer,
   winzig – oder gar nicht (Led Zeppelin IV trägt keinen einzigen
   Buchstaben). Ein Modell, das das BILD wiedererkennt, kommt dort zum
   Ziel, wo Buchstabenlesen scheitert.

   Warum Gemini und nicht mehr Cloud Vision: die erste Fassung rief
   vision.googleapis.com mit Web Detection auf. Der Schlüssel dieses
   Projekts ist aber ein AI-Studio-Schlüssel (Präfix `AQ.`), und den
   nimmt die Vision-API nicht an – gemessen: 401 CREDENTIALS_MISSING,
   während ein formgerechter `AIza…`-Schlüssel dort 400 API_KEY_INVALID
   bekommt. Vision hätte also einen zweiten Schlüssel, ein Cloud-Projekt
   mit aktivierter API und hinterlegter Abrechnung verlangt.

   Der Umweg lohnt auch inhaltlich: Vision lieferte ein bestGuessLabel
   wie "rumours fleetwood mac album cover" – einen unscharfen Satz, aus
   dem die Discogs-Suche sich das Passende suchen musste. Gemini
   antwortet per responseSchema mit getrennten Feldern für Interpret und
   Titel. Aus "Fleetwood Mac" + "Rumours" wird ein sauberer Suchtext.

   DSGVO-Hinweis, der eine Entscheidung verlangt: hier verlässt ein Foto
   des Nutzers das Gerät und geht an Google. Das Projekt vermeidet
   Google-Fonts ausdrücklich aus diesem Grund (CLAUDE.md). Ein Foto wiegt
   schwerer als eine IP-Adresse – der Cover-Weg gehört deshalb in die
   Datenschutzerklärung und sollte eine bewusste Handlung bleiben, keine
   Hintergrundabfrage. Am Modell hat sich das nichts geändert.

   Die Antwortform `{ label, entitaeten }` stammt noch aus der
   Vision-Zeit und bleibt bewusst erhalten: app/js/cover-erkennen.js
   nimmt `label`, sonst die beiden stärksten `entitaeten`. So brauchte
   der Wechsel keinen Eingriff am Client.
   ===================================================================== */

const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY");

// gemini-3.6-flash: schnell und billig genug für einen Scan pro Hülle.
// Die älteren Flash-Modelle sind abgekündigt und antworten mit 404.
const MODELL = "gemini-3.6-flash";

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
  if (!GEMINI_KEY) return json({ error: "GEMINI_API_KEY ist nicht gesetzt." }, 503);

  let bild: string;
  try {
    const body = await req.json();
    bild = String(body.bild || "");
  } catch {
    return json({ error: "Ungültiger Rumpf." }, 400);
  }
  if (!bild) return json({ error: "Feld 'bild' (base64, ohne data:-Präfix) wird erwartet." }, 400);

  // Grobe Obergrenze: ein Sucherbild ist deutlich kleiner. Alles
  // Größere ist eher ein Fehler als ein Cover.
  if (bild.length > 8_000_000) return json({ error: "Bild zu groß." }, 413);

  let res: Response;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODELL}:generateContent`,
      {
        method: "POST",
        headers: { "x-goog-api-key": GEMINI_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                text:
                  "Auf dem Bild ist die Hülle einer Musikveröffentlichung " +
                  "(Schallplatte, CD). Nenne Interpret und Albumtitel. " +
                  "Erkennst du die Hülle nicht sicher wieder, setze sicher " +
                  "auf false und rate nicht.",
              },
              { inline_data: { mime_type: "image/jpeg", data: bild } },
            ],
          }],
          generationConfig: {
            // Schema statt freiem Text: sonst kämen mal Fließtext, mal
            // JSON in einem Markdown-Block zurück, und das Parsen wäre
            // die eigentliche Fehlerquelle.
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                interpret: { type: "STRING" },
                titel: { type: "STRING" },
                sicher: { type: "BOOLEAN" },
              },
              required: ["interpret", "titel", "sicher"],
            },
            // Hier ist nichts zu erfinden: dieselbe Hülle soll immer
            // dieselbe Antwort geben.
            temperature: 0,
          },
        }),
      },
    );
  } catch (e) {
    return json({ error: `Gemini nicht erreichbar: ${(e as Error).message}` }, 502);
  }

  // 429 unverändert weiterreichen – der Client kennt den Fall bereits
  // von der Discogs-Suche her und zeigt seinen eigenen Hinweis.
  if (res.status === 429) return json({ error: "Rate-Limit" }, 429);
  if (!res.ok) {
    const text = await res.text();
    return json({ error: `Gemini antwortete mit ${res.status}`, detail: text.slice(0, 300) }, res.status);
  }

  const daten = await res.json();
  const roh = daten?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  let erkannt: { interpret?: string; titel?: string; sicher?: boolean };
  try {
    erkannt = JSON.parse(roh);
  } catch {
    // Das Schema macht das unwahrscheinlich, aber ein abgeschnittener
    // Rumpf (MAX_TOKENS, Filter) landet genau hier.
    return json({ label: "", entitaeten: [], hinweis: "Antwort war nicht lesbar." });
  }

  const interpret = (erkannt.interpret || "").trim();
  const titel = (erkannt.titel || "").trim();

  if (!interpret && !titel) {
    return json({ label: "", entitaeten: [], hinweis: "Cover nicht wiedererkannt." });
  }

  // Getrennt als Entitäten mitgeben: liegt das Modell beim Titel daneben,
  // führt der Interpret allein immer noch zu einer brauchbaren Trefferliste.
  const entitaeten = [
    interpret ? { text: interpret, score: erkannt.sicher ? 0.9 : 0.5 } : null,
    titel ? { text: titel, score: erkannt.sicher ? 0.9 : 0.5 } : null,
  ].filter(Boolean);

  // Bei Unsicherheit kein `label`: der Client fügt dann selbst aus den
  // Entitäten einen Suchtext zusammen, statt einen geratenen Namen als
  // gesicherte Auskunft zu behandeln.
  const label = erkannt.sicher ? [interpret, titel].filter(Boolean).join(" ") : "";

  return json({ label, entitaeten, sicher: Boolean(erkannt.sicher) });
});
