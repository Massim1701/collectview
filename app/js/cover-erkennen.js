/* =====================================================================
   cover-erkennen.js – Cover per Bilderkennung bestimmen.

   Zwei Stufen, in dieser Reihenfolge:

     1. Bilderkennung (Edge Function cover-erkennen, Gemini): erkennt
        die Hülle als BILD wieder und liefert Interpret und Titel
        getrennt. Kommt auch bei verzierter Schrift, gedrehtem Text oder
        Hüllen ganz ohne Text zum Ziel – Led Zeppelin IV trägt keinen
        einzigen Buchstaben.
     2. Texterkennung im Browser (Tesseract): liest, was draufsteht.
        Braucht kein Netz nach dem ersten Mal und kostet nichts.

   Stufe 1 fällt weg, wenn die Funktion nicht deployt ist (404) oder
   ohne Schlüssel läuft (503). Dann bleibt es bei Stufe 2, so wie
   bisher – kein Zusatz darf den Cover-Weg lahmlegen.
   ===================================================================== */

const COVER_PROXY = `${SUPABASE_URL}/functions/v1/cover-erkennen`;

/** Einmal als nicht verfügbar erkannt, nicht bei jedem Foto neu fragen. */
let coverErkennungAus = false;

/** Canvas als base64-JPEG, ohne das data:-Präfix, das die API nicht will. */
function canvasAlsBase64(canvas, qualitaet = 0.82) {
  const url = canvas.toDataURL("image/jpeg", qualitaet);
  return url.slice(url.indexOf(",") + 1);
}

/**
 * Fragt die Bilderkennung. Ergebnis { label, entitaeten } oder null,
 * wenn dieser Weg nicht zur Verfügung steht.
 */
async function coverErkennen(canvas) {
  if (coverErkennungAus) return null;

  try {
    const { data } = await sb.auth.getSession();
    const token = data?.session?.access_token;
    // Ohne Sitzung kein Zugriff: die Funktion prüft das JWT, damit sie
    // nicht als offene Bilderkennung auf eure Rechnung im Netz steht.
    if (!token) return null;

    const res = await fetch(COVER_PROXY, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ bild: canvasAlsBase64(canvas) }),
    });

    // 404 = nicht deployt, 503 = kein Schlüssel. Ändert sich beides
    // nicht innerhalb einer Sitzung.
    if (res.status === 404 || res.status === 503) {
      coverErkennungAus = true;
      return null;
    }
    if (!res.ok) return null;

    return await res.json();
  } catch {
    coverErkennungAus = true;
    return null;
  }
}

/**
 * Der Text, mit dem Discogs befragt wird.
 *
 * bestGuessLabel zuerst – das ist Googles eigene Zusammenfassung
 * ("abbey road beatles") und trifft für Discogs am besten. Fehlt es,
 * tun es die beiden stärksten Entitäten; eine allein ist meist nur der
 * Interpret und liefert dessen ganzes Werk.
 */
function coverSuchtext(erkannt) {
  if (!erkannt) return "";
  if (erkannt.label) return String(erkannt.label).trim();
  return (erkannt.entitaeten || [])
    .slice(0, 2)
    .map((e) => e.text)
    .filter(Boolean)
    .join(" ")
    .trim();
}
