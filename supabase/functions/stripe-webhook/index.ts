/* =====================================================================
   stripe-webhook – Stripe meldet hier jede Änderung am Web-Abo.

   Nur Stripe darf hierher schreiben: die Signaturprüfung (constructEvent
   mit STRIPE_WEBHOOK_SECRET) ist die einzige Authentifizierung, es gibt
   kein Nutzer-JWT. Deshalb entscheidet ausschließlich dieses Ereignis
   selbst, welches Konto betroffen ist – nie ein mitgeschickter Rumpf.

   Drei Ereignisse:
     checkout.session.completed  -> stripe_abo_setzen()   (nutzer aus
                                     client_reference_id, gesetzt von
                                     stripe-checkout)
     customer.subscription.updated -> stripe_abo_aktualisiert() (Konto
                                     über stripe_subscription_id gefunden)
     customer.subscription.deleted -> stripe_abo_beendet()

   In Stripe unter Entwickler -> Webhooks einzutragen, Ziel-URL diese
   Function, genau diese drei Ereignisse abonnieren.
   ===================================================================== */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import Stripe from "https://esm.sh/stripe@17?target=deno";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET");

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST erwartet." }, 405);
  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
    return json({ error: "Stripe ist auf dem Server noch nicht eingerichtet." }, 503);
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
  const signatur = req.headers.get("stripe-signature");
  const rohtext = await req.text();

  let event: Stripe.Event;
  try {
    // Async-Variante: Deno hat kein Node-crypto, die Prüfung läuft über
    // SubtleCrypto. Ohne gültige Signatur ist der Aufrufer nicht Stripe,
    // sondern irgendjemand, der die öffentliche URL erraten hat.
    event = await stripe.webhooks.constructEventAsync(rohtext, signatur ?? "", STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    return json({ error: `Signatur ungültig: ${e.message}` }, 400);
  }

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const nutzer = session.client_reference_id;
        const kunde = String(session.customer ?? "");
        const aboId = String(session.subscription ?? "");
        if (!nutzer || !kunde || !aboId) break; // kein Abo-Checkout (sollte hier nicht vorkommen)

        const abo = await stripe.subscriptions.retrieve(aboId);
        const laeuftBis = new Date(abo.current_period_end * 1000).toISOString();

        const { error } = await sb.rpc("stripe_abo_setzen", {
          nutzer, kunde, abo: aboId, laeuft_bis: laeuftBis,
        });
        if (error) throw error;
        break;
      }

      case "customer.subscription.updated": {
        const abo = event.data.object as Stripe.Subscription;
        const aktiv = abo.status === "active" || abo.status === "trialing";
        const laeuftBis = new Date(abo.current_period_end * 1000).toISOString();

        const { error } = await sb.rpc("stripe_abo_aktualisiert", {
          abo: abo.id, aktiv, laeuft_bis: laeuftBis,
        });
        if (error) throw error;
        break;
      }

      case "customer.subscription.deleted": {
        const abo = event.data.object as Stripe.Subscription;
        const { error } = await sb.rpc("stripe_abo_beendet", { abo: abo.id });
        if (error) throw error;
        break;
      }

      default:
        // Alle anderen Ereignisse sind für uns uninteressant (z. B.
        // invoice.paid) – Stripe erwartet trotzdem ein 2xx, sonst
        // versucht es die Zustellung endlos erneut.
        break;
    }
  } catch (e) {
    // 500 zurückgeben: Stripe wiederholt die Zustellung dann automatisch
    // (bis zu drei Tage lang) – bei einem kurzen DB-Aussetzer holt sich
    // das Konto sein Abo so von allein nach.
    return json({ error: e.message }, 500);
  }

  return json({ received: true });
});
