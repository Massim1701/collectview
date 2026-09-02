/* =====================================================================
   feedback-melden – schickt eine Rückmeldung als Mail an den Support.

   Warum es das braucht: Rückmeldungen landeten ausschließlich in der
   Tabelle `feedback`. Benachrichtigt wurde niemand – wer etwas schrieb,
   schrieb ins Leere, bis jemand von Hand in die Datenbank sah. Genau so
   verliert man die Hinweise, für die man die Funktion eingebaut hat.

   Der Zuschnitt ist bewusst eng: Diese Function verschickt NICHT, was
   ihr der Aufrufer hinreicht. Sie bekommt nur eine ID, liest den
   gespeicherten Eintrag selbst und prüft, dass er dem Anrufer gehört.
   Sonst wäre sie ein offenes Mailtor – jeder angemeldete Nutzer könnte
   beliebigen Text an unser Postfach schicken lassen.

   Versandweg: eine URL in FEEDBACK_MAIL_URL, gedacht für den
   AJAX-Endpunkt von formsubmit (https://formsubmit.co/ajax/<token>).
   Kein Schlüssel nötig, kein weiterer Dienst. Fehlt die Variable, tut
   die Function nichts und sagt das deutlich – die Rückmeldung ist dann
   trotzdem gespeichert, nur unbenachrichtigt.

   Absichtlich NICHT mitgeschickt: die E-Mail-Adresse des Absenders. Zum
   Antworten wäre sie nützlich, aber sie steht so in keiner
   Datenschutzerklärung. Wer sie will, ergänzt sie hier bewusst – und
   dort.
   ===================================================================== */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MAIL_URL = Deno.env.get("FEEDBACK_MAIL_URL");

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

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "Anmeldung nötig." }, 401);

  let id: unknown;
  try {
    id = (await req.json())?.id;
  } catch { /* unten abgefangen */ }
  if (typeof id !== "string" || !id) return json({ error: "id fehlt." }, 400);

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Wer ruft, kommt aus dem Token – nie aus dem Rumpf.
  const { data: nutzerDaten, error: nutzerFehler } = await sb.auth.getUser(jwt);
  const nutzer = nutzerDaten?.user;
  if (nutzerFehler || !nutzer) return json({ error: "Anmeldung ungültig." }, 401);

  const { data: eintrag, error: leseFehler } = await sb
    .from("feedback")
    .select("id, user_id, category, message, page, user_agent, created_at")
    .eq("id", id)
    .maybeSingle();

  if (leseFehler) {
    console.error("Feedback nicht lesbar:", leseFehler.message);
    return json({ error: "Feedback nicht lesbar." }, 500);
  }
  if (!eintrag) return json({ error: "Kein solches Feedback." }, 404);

  // Fremdes Feedback wird nicht verschickt, auch nicht versehentlich.
  if (eintrag.user_id !== nutzer.id) {
    console.error(`Feedback ${id} gehört nicht zu ${nutzer.id}.`);
    return json({ error: "Nicht dein Feedback." }, 403);
  }

  if (!MAIL_URL) {
    // Kein Fehler für den Nutzer: gespeichert ist gespeichert.
    console.warn(
      "FEEDBACK_MAIL_URL ist nicht gesetzt – Rückmeldung wurde gespeichert, " +
        "aber niemand benachrichtigt.",
    );
    return json({ ok: true, gemeldet: false, grund: "kein Versandweg konfiguriert" });
  }

  const res = await fetch(MAIL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      _subject: `CollectView — Rückmeldung (${eintrag.category})`,
      Kategorie: eintrag.category,
      Nachricht: eintrag.message,
      Seite: eintrag.page ?? "—",
      Zeitpunkt: eintrag.created_at,
      Nutzer: eintrag.user_id,
      Browser: (eintrag.user_agent ?? "").slice(0, 300),
    }),
  });

  if (!res.ok) {
    // 500, damit ein Wiederholungsversuch möglich bleibt – aber der
    // Client zeigt das nicht als Fehler an, die Rückmeldung steht ja.
    console.error(`Versand scheiterte mit ${res.status}`);
    return json({ error: `Versand scheiterte mit ${res.status}` }, 500);
  }

  console.log(`Rückmeldung ${eintrag.id} gemeldet.`);
  return json({ ok: true, gemeldet: true });
});
