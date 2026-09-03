/* =====================================================================
   stripe-checkout – Checkout-Session für das Web-Abo anlegen.

   Für Nutzer, die die App nicht wollen, aber CollectView Plus über die
   Website kaufen möchten (parallel zu abo-pruefen, das für den In-App-
   Kauf über Apple/Google zuständig ist). Der Client bekommt nur die
   Checkout-URL zurück, zu der er weiterleitet – Preise, Produkt-IDs und
   der eigentliche Zahlvorgang bleiben komplett bei Stripe.

   client_reference_id trägt die Supabase-User-ID durch den ganzen
   Checkout hindurch bis zum Webhook-Event – das ist der einzige Weg,
   mit dem stripe-webhook nachher weiß, welchem Konto das Abo gehört.
   ===================================================================== */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import Stripe from "https://esm.sh/stripe@17?target=deno";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");

// In Stripe unter Produktkatalog -> Preise angelegt, price_... IDs.
const STRIPE_PREISE: Record<string, string | undefined> = {
  monatlich: Deno.env.get("STRIPE_PRICE_MONATLICH"),
  jaehrlich: Deno.env.get("STRIPE_PRICE_JAEHRLICH"),
};

// Wohin nach Erfolg/Abbruch zurück. Der Cloudflare-Deploy liefert die
// Wireframes unter /wireframes/ aus (siehe web/render-landing.mjs).
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://collectview.site";

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

  if (!STRIPE_SECRET_KEY) {
    return json({ error: "Stripe ist auf dem Server noch nicht eingerichtet." }, 503);
  }

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "Anmeldung nötig." }, 401);

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Wer kauft, kommt aus dem Token – nie aus dem Rumpf. Sonst könnte
  // jeder ein Abo für ein fremdes Konto bestellen.
  const { data: nutzerDaten, error: nutzerFehler } = await sb.auth.getUser(jwt);
  if (nutzerFehler || !nutzerDaten?.user) return json({ error: "Anmeldung ungültig." }, 401);
  const nutzer = nutzerDaten.user;

  let zyklus = "monatlich";
  try {
    const rumpf = await req.json();
    if (rumpf?.zyklus === "jaehrlich") zyklus = "jaehrlich";
  } catch {
    // kein/leerer Rumpf -> Standard bleibt "monatlich"
  }

  const preisId = STRIPE_PREISE[zyklus];
  if (!preisId) {
    return json({ error: `Für "${zyklus}" ist noch kein Stripe-Preis hinterlegt.` }, 503);
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: preisId, quantity: 1 }],
      client_reference_id: nutzer.id,
      customer_email: nutzer.email ?? undefined,
      success_url: `${SITE_URL}/wireframes/pricing.html?checkout=erfolg`,
      cancel_url: `${SITE_URL}/wireframes/pricing.html?checkout=abgebrochen`,
    });

    if (!session.url) throw new Error("Stripe hat keine Checkout-URL geliefert.");
    return json({ url: session.url });
  } catch (e) {
    return json({ error: `Checkout konnte nicht gestartet werden: ${e.message}` }, 502);
  }
});
