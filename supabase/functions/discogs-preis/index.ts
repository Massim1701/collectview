/* =====================================================================
   discogs-preis – Marktwert eines Release, aus Discogs' Preisvorschlägen
   (marketplace/price_suggestions), pro Zustandsstufe. Ergebnis wird auf
   releases.value_* geschrieben (Service-Role, siehe db/release-value.sql)
   – der Wert gehört zum Release, nicht zum einzelnen Sammlungseintrag,
   selbes Prinzip wie Cover/Titel in db/releases.sql. Ist ein Wert höchstens
   7 Tage alt, kommt er direkt aus der DB zurück, kein neuer Discogs-Call.

   Kein direkter Fallback ohne Proxy (anders als discogs-suche): der
   Preisvorschlag-Endpunkt braucht ohnehin Authentifizierung, ein
   token-loser Direktweg gäbe es also gar nicht. Ohne Vorschläge (z.B.
   Release ohne Marktplatz-Historie) fällt die Funktion auf lowest_price
   des Release zurück – dann sind low, median und high identisch.
   ===================================================================== */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const DISCOGS_TOKEN = Deno.env.get("DISCOGS_TOKEN");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const USER_AGENT = "CollectView/0.1 +https://github.com/collectview";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const MAX_ALTER_MS = 7 * 24 * 60 * 60 * 1000; // 7 Tage

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, ...extra, "Content-Type": "application/json" },
  });
}

const sbAdmin = createClient(SUPABASE_URL, SERVICE_ROLE);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  // Nur angemeldete Nutzer dürfen den Discogs-Call auslösen – dieselbe
  // Prüfung wie discogs-suche, nur ohne den Token durchzureichen.
  const auth = req.headers.get("authorization");
  if (!auth) return json({ error: "Anmeldung erforderlich." }, 401);

  if (!DISCOGS_TOKEN) return json({ error: "DISCOGS_TOKEN ist nicht gesetzt." }, 503);

  const url = new URL(req.url);
  const discogsId = url.searchParams.get("id");
  if (!discogsId || !/^\d+$/.test(discogsId)) {
    return json({ error: "id (numerische Discogs-Release-ID) wird erwartet." }, 400);
  }

  // 1) Cache: releases.value_* jünger als 7 Tage direkt zurückgeben.
  const { data: bestehend } = await sbAdmin
    .from("releases")
    .select("id, value_low, value_median, value_high, value_currency, value_fetched_at")
    .eq("discogs_id", discogsId)
    .maybeSingle();

  if (bestehend?.value_fetched_at) {
    const alter = Date.now() - new Date(bestehend.value_fetched_at).getTime();
    if (alter < MAX_ALTER_MS && bestehend.value_low != null) {
      return json({
        low: bestehend.value_low,
        median: bestehend.value_median,
        high: bestehend.value_high,
        currency: bestehend.value_currency,
        fetched_at: bestehend.value_fetched_at,
        cached: true,
      });
    }
  }

  // 2) Preisvorschläge holen.
  let low: number | null = null;
  let median: number | null = null;
  let high: number | null = null;
  let currency: string | null = null;
  let quelle: "price_suggestions" | "lowest_price" | "none" = "none";

  try {
    const res = await fetch(`https://api.discogs.com/marketplace/price_suggestions/${discogsId}`, {
      headers: { "Authorization": `Discogs token=${DISCOGS_TOKEN}`, "User-Agent": USER_AGENT },
    });
    if (res.status === 429) return json({ error: "Rate-Limit" }, 429);
    if (res.ok) {
      const daten = await res.json();
      const preise = Object.values(daten || {})
        .map((v: any) => v?.value)
        .filter((v: any) => typeof v === "number" && v > 0)
        .sort((a: number, b: number) => a - b);
      if (preise.length) {
        low = preise[0];
        high = preise[preise.length - 1];
        median = preise[Math.floor((preise.length - 1) / 2)];
        currency = Object.values(daten)[0]?.currency || "EUR";
        quelle = "price_suggestions";
      }
    }
  } catch {
    // Direkt zum Fallback unten – kein harter Fehler nur wegen Preisen.
  }

  // 3) Fallback: niedrigster Marktplatz-Preis aus dem Release selbst.
  if (quelle === "none") {
    try {
      const res = await fetch(`https://api.discogs.com/releases/${discogsId}`, {
        headers: { "Authorization": `Discogs token=${DISCOGS_TOKEN}`, "User-Agent": USER_AGENT },
      });
      if (res.ok) {
        const daten = await res.json();
        if (typeof daten.lowest_price === "number") {
          low = median = high = daten.lowest_price;
          currency = "USD"; // Discogs' lowest_price kommt ohne Währungsangabe, i.d.R. USD.
          quelle = "lowest_price";
        }
      }
    } catch {
      // Kein Fallback möglich – bleibt "none", unten sauber beantwortet.
    }
  }

  if (quelle === "none") {
    return json({ low: null, median: null, high: null, currency: null, source: "none" });
  }

  // 4) In releases cachen, wenn es den Release schon gibt (discogsSuche/
  //    upsertRelease legen ihn i.d.R. vor dem ersten Aufruf hier an).
  if (bestehend?.id) {
    await sbAdmin
      .from("releases")
      .update({
        value_low: low,
        value_median: median,
        value_high: high,
        value_currency: currency,
        value_fetched_at: new Date().toISOString(),
      })
      .eq("id", bestehend.id);
  }

  return json(
    { low, median, high, currency, source: quelle, cached: false },
    200,
    { "Cache-Control": "public, max-age=1800" },
  );
});
