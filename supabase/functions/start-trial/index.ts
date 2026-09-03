/* =====================================================================
   start-trial – 7 Tage CollectView Plus zum Testen, einmal pro Konto.

   Läuft serverseitig, nicht als Client-Update auf profiles: sonst
   könnte sich jede und jeder beliebig oft selbst verlängern (genau das
   Problem, das protect_subscription_fields() in db/abo.sql schon für
   subscription_status löst -- trial_ends_at braucht denselben Schutz,
   nur eben aktiv statt passiv).

   Missbrauchsschutz, ehrlich eingeordnet:
     - E-Mail: strukturell gedeckt. Ein Konto = eine E-Mail, Supabase
       selbst verhindert doppelte Adressen -- ein einmal verbrauchtes
       Konto (trial_ends_at gesetzt) bekommt nie wieder eins.
     - IP: locker begrenzt (siehe TRIAL_LIMIT_PRO_IP unten). Hilft gegen
       "schnell fünf Wegwerf-Mails hintereinander", nicht gegen jemanden,
       der sich davon abhalten lässt -- dynamische IPs, VPNs, Mobilfunk-
       NAT machen das trivial umgehbar. Bewusst grosszügig genug, damit
       eine Familie/ein Büro hinter derselben IP nicht gegenseitig blockt.
     - Geräte-ID/"Mac-ID": absichtlich NICHT gebaut. Auf dem Web gibt es
       dafür nur Fingerprinting-Tricks (unzuverlässig, und grenzwertig
       für App-Store-Datenschutzprüfungen); nativ bräuchte es ein neues
       Plugin (@capacitor/device) für ein Signal, das sich durch
       Neuinstallation ohnehin zurücksetzt.
     - Der eigentlich robuste Weg wäre ein Trial über Apple/Google IAP
       direkt (siehe OFFEN.md) -- die kennen die Zahlungsmethode. Das ist
       Store-Konfiguration, kein Code, und deckt nur die beiden nativen
       Kanäle ab, nicht den Website/Stripe-Kanal (db/stripe-web-abo.sql).

   Zwei Nachschärfungen (03.09.2026), weil "eine E-Mail = ein Konto" für
   sich genommen zu wörtlich genommen war:
     - Gmail/Googlemail zählen Punkte im Namen nicht und ignorieren alles
       ab "+" -- alice@gmail.com, a.l.i.c.e@gmail.com und
       alice+irgendwas@gmail.com landen im selben Postfach, wären für
       Supabase aber drei verschiedene Konten. normalisiereEmail() bildet
       alle drei auf dieselbe Zeichenkette ab, damit ein zweites Konto
       auf dieselbe Inbox keinen zweiten Testzeitraum bekommt.
     - Eine kurze Sperrliste bekannter Wegwerf-Mail-Anbieter -- nicht
       vollständig (kann sie nie sein), nimmt aber den bequemsten Weg.
   ===================================================================== */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// Nicht vollständig, nie vollständig zu bekommende Liste bekannter
// Wegwerf-Mail-Anbieter. Wer eine eigene, hier nicht gelistete Adresse
// nutzt, kommt trotzdem durch -- das ist die Grenze dieses Ansatzes,
// keine Lücke, die sich mit noch mehr Domains schließen ließe.
const WEGWERF_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "guerrillamail.info", "10minutemail.com",
  "10minutemail.net", "temp-mail.org", "tempmail.com", "trashmail.com",
  "yopmail.com", "throwawaymail.com", "getnada.com", "sharklasers.com",
  "dispostable.com", "maildrop.cc", "fakeinbox.com", "mohmal.com",
]);

/**
 * Gmail/Googlemail auf die tatsächliche Postfach-Identität normalisieren:
 * Punkte im lokalen Teil zählen bei Google nicht, alles ab "+" auch
 * nicht. Für alle anderen Anbieter bleibt die Adresse (kleingeschrieben)
 * unverändert -- ein Punkt oder "+" bedeutet dort ein anderes Postfach.
 */
function normalisiereEmail(email: string): string {
  const [lokal, domain] = email.toLowerCase().trim().split("@");
  if (!domain) return email.toLowerCase().trim();
  if (domain === "gmail.com" || domain === "googlemail.com") {
    return `${lokal.split("+")[0].replace(/\./g, "")}@gmail.com`;
  }
  return `${lokal}@${domain}`;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const TRIAL_TAGE = 7;
const TRIAL_LIMIT_PRO_IP = 3; // pro 30 Tage -- siehe Kommentar oben
const TRIAL_FENSTER_TAGE = 30;

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

/** Erste Adresse aus x-forwarded-for -- der Client selbst könnte den
    Header fälschen, aber das würde ihm nur schaden (eigene Rate-Zählung
    verwässern), nie einen fremden Trial verlängern. */
function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for") || "";
  const erste = xff.split(",")[0]?.trim();
  return erste || req.headers.get("cf-connecting-ip") || "unbekannt";
}

async function hashIp(ip: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
  return Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST erwartet." }, 405);

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "Anmeldung nötig." }, 401);

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: nutzerDaten, error: nutzerFehler } = await sb.auth.getUser(jwt);
  if (nutzerFehler || !nutzerDaten?.user) return json({ error: "Anmeldung ungültig." }, 401);
  const nutzer = nutzerDaten.user.id;

  const { data: profil, error: profilFehler } = await sb
    .from("profiles")
    .select("trial_ends_at, subscription_status, role")
    .eq("id", nutzer)
    .maybeSingle();
  if (profilFehler) return json({ error: profilFehler.message }, 500);

  if (profil?.trial_ends_at) {
    return json({ error: "Du hattest schon einen Testzeitraum -- der lässt sich nicht wiederholen." }, 409);
  }
  if (profil?.subscription_status === "active" || profil?.role === "admin" || profil?.role === "moderator") {
    return json({ error: "Du hast bereits vollen Zugriff, ein Testzeitraum bringt nichts zusätzlich." }, 409);
  }

  const email = nutzerDaten.user.email ?? "";
  const domain = email.split("@")[1]?.toLowerCase();
  if (domain && WEGWERF_DOMAINS.has(domain)) {
    return json({ error: "Mit einer Wegwerf-E-Mail-Adresse geht kein Testzeitraum." }, 403);
  }

  // Dasselbe Postfach unter leicht anderer Schreibweise (Gmail-Punkte,
  // "+"-Tag) hat schon einmal einen Testzeitraum gehabt? Admin-API statt
  // sb.from(): auth.users ist nicht über PostgREST erreichbar. Bei der
  // aktuellen Nutzerzahl (siehe admin.html) reicht eine Seite ohne
  // Paginierung -- wächst das deutlich, muss hier eine Schleife über
  // listUsers({ page }) rein.
  const normalisiert = normalisiereEmail(email);
  const { data: alle, error: listeFehler } = await sb.auth.admin.listUsers({ perPage: 1000 });
  if (listeFehler) return json({ error: listeFehler.message }, 500);

  const verwandteIds = (alle?.users ?? [])
    .filter((u) => u.id !== nutzer && u.email && normalisiereEmail(u.email) === normalisiert)
    .map((u) => u.id);

  if (verwandteIds.length > 0) {
    const { count, error: verwandtFehler } = await sb
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .in("id", verwandteIds)
      .not("trial_ends_at", "is", null);
    if (verwandtFehler) return json({ error: verwandtFehler.message }, 500);
    if ((count ?? 0) > 0) {
      return json({ error: "Für dieses Postfach lief schon ein Testzeitraum, unter einer anderen Schreibweise der Adresse." }, 409);
    }
  }

  const ip = clientIp(req);
  const ipHash = await hashIp(ip);
  const fensterAb = new Date(Date.now() - TRIAL_FENSTER_TAGE * 24 * 60 * 60 * 1000).toISOString();

  const { count, error: zaehlFehler } = await sb
    .from("trial_starts")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gte("created_at", fensterAb);
  if (zaehlFehler) return json({ error: zaehlFehler.message }, 500);

  if ((count ?? 0) >= TRIAL_LIMIT_PRO_IP) {
    return json({
      error: "Von dieser Verbindung wurden zuletzt schon mehrere Testzeiträume gestartet. Bitte kontaktiere den Support, wenn das ein Irrtum ist.",
    }, 429);
  }

  const laeuftBis = new Date(Date.now() + TRIAL_TAGE * 24 * 60 * 60 * 1000).toISOString();

  const { error: updateFehler } = await sb
    .from("profiles")
    .update({ trial_ends_at: laeuftBis })
    .eq("id", nutzer);
  if (updateFehler) return json({ error: updateFehler.message }, 500);

  await sb.from("trial_starts").insert({ ip_hash: ipHash, user_id: nutzer });

  return json({ laeuftBis });
});
