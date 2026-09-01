/* =====================================================================
   abo-notify-google – Real-time Developer Notifications von Google Play.

   Gegenstück zu abo-notify (Apple). Ohne das endet ein Play-Abo nie:
   abo_beenden wird sonst nur gerufen, wenn die App von sich aus einen
   Beleg vorlegt, und das tut sie nur beim Kauf und beim Wiederherstellen.

   Der Unterschied zu Apple ist grundlegend und macht diese Function
   einfacher, nicht komplizierter:

   Apple signiert seine Meldungen. Der Inhalt IST die Wahrheit, sobald
   die Signatur hält – deshalb steht dort eine Zuordnungstabelle, welche
   Meldung was bedeutet.

   Google signiert den Inhalt NICHT. Die Meldung sagt nur "an diesem
   Kauf hat sich etwas geändert". Also glauben wir ihr genau das und
   sonst nichts: wir fragen anschließend die Play Developer API, wie der
   Kauf jetzt dasteht, und richten uns danach. Das braucht keine
   Tabelle von Ereignistypen – Google hat dreizehn davon, und sie kommen
   nicht in den Code, weil keiner davon eine Entscheidung trifft. Es
   macht die Sache zugleich fälschungssicher: wer uns eine erfundene
   Meldung schickt, erreicht nur, dass wir bei Google nachfragen und den
   wahren Zustand hinschreiben.

   Deployen ohne JWT-Prüfung – Pub/Sub kennt keine Supabase-Tokens:

     supabase functions deploy abo-notify-google --no-verify-jwt
   ===================================================================== */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { pruefeGooglesAbo } from "../_shared/google-play.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DIENSTKONTO = Deno.env.get("GOOGLE_PLAY_SERVICE_ACCOUNT");
const PAKET = Deno.env.get("ANDROID_PACKAGE") ?? "online.driftware.collectview";

/* Pub/Sub kann jede Zustellung mit einem von Google signierten
   OIDC-Token versehen. Steht die erwartete Absender-Adresse hier, wird
   sie erzwungen; fehlt sie, läuft die Function trotzdem – und sagt es
   in jedem Log deutlich. Das ist vertretbar, weil die Sicherheit hier
   nicht an der Meldung hängt, sondern an der Rückfrage bei Google. Vor
   dem Launch gehört die Adresse gesetzt. */
const PUBSUB_ABSENDER = Deno.env.get("GOOGLE_PUBSUB_EMAIL");
const PUBSUB_ZIELGRUPPE = Deno.env.get("GOOGLE_PUBSUB_AUDIENCE");

const JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
let jwksSpeicher: { geholt: number; schluessel: JsonWebKey[] } | null = null;

async function holeJwks(): Promise<JsonWebKey[]> {
  const jetzt = Date.now();
  if (jwksSpeicher && jetzt - jwksSpeicher.geholt < 3_600_000) {
    return jwksSpeicher.schluessel;
  }
  const res = await fetch(JWKS_URL);
  if (!res.ok) throw new Error(`JWKS nicht erreichbar (${res.status})`);
  const { keys } = await res.json();
  jwksSpeicher = { geholt: jetzt, schluessel: keys };
  return keys;
}

const vonB64 = (t: string): Uint8Array =>
  Uint8Array.from(
    atob(t.replace(/-/g, "+").replace(/_/g, "/")),
    (z) => z.charCodeAt(0),
  );

const alsText = (t: string): string => new TextDecoder().decode(vonB64(t));

/**
 * Das OIDC-Token der Pub/Sub-Zustellung prüfen.
 *
 * Wirft, wenn etwas nicht stimmt. Prüft Signatur gegen Googles
 * öffentliche Schlüssel, Aussteller, Ablauf und – sofern konfiguriert –
 * Absenderadresse und Zielgruppe.
 */
async function pruefePubSubToken(kopfzeile: string | null): Promise<string> {
  const roh = (kopfzeile ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!roh) throw new Error("kein OIDC-Token");

  const [kopfB64, rumpfB64, sigB64] = roh.split(".");
  if (!kopfB64 || !rumpfB64 || !sigB64) throw new Error("kein JWT");

  const kopf = JSON.parse(alsText(kopfB64));
  if (kopf.alg !== "RS256") throw new Error(`Algorithmus ${kopf.alg}`);

  const jwk = (await holeJwks()).find((k) =>
    (k as { kid?: string }).kid === kopf.kid
  );
  if (!jwk) throw new Error("kid unbekannt");

  const schluessel = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );

  const ok = await crypto.subtle.verify(
    { name: "RSASSA-PKCS1-v1_5" },
    schluessel,
    vonB64(sigB64),
    new TextEncoder().encode(`${kopfB64}.${rumpfB64}`),
  );
  if (!ok) throw new Error("Signatur stimmt nicht");

  const rumpf = JSON.parse(alsText(rumpfB64));
  const jetzt = Math.floor(Date.now() / 1000);
  if (Number(rumpf.exp ?? 0) < jetzt) throw new Error("Token abgelaufen");
  if (
    rumpf.iss !== "https://accounts.google.com" &&
    rumpf.iss !== "accounts.google.com"
  ) {
    throw new Error(`Aussteller ${rumpf.iss}`);
  }
  if (PUBSUB_ZIELGRUPPE && rumpf.aud !== PUBSUB_ZIELGRUPPE) {
    throw new Error("Zielgruppe passt nicht");
  }
  if (PUBSUB_ABSENDER) {
    if (rumpf.email !== PUBSUB_ABSENDER) throw new Error("fremder Absender");
    if (rumpf.email_verified !== true) throw new Error("Adresse unbestätigt");
  }
  return String(rumpf.email ?? "");
}

function grund(e: unknown): string {
  if (e && typeof e === "object") {
    const teile = [
      (e as { name?: unknown }).name,
      (e as { message?: unknown }).message,
    ].filter(Boolean);
    const ursache = (e as { cause?: unknown }).cause;
    if (ursache) teile.push(`cause: ${grund(ursache)}`);
    return teile.join(" / ") || String(e);
  }
  return String(e);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Nur POST." }, 405);

  if (PUBSUB_ABSENDER || PUBSUB_ZIELGRUPPE) {
    try {
      await pruefePubSubToken(req.headers.get("Authorization"));
    } catch (e) {
      console.error("Pub/Sub-Token abgelehnt:", grund(e));
      return json({ error: "Nicht autorisiert." }, 401);
    }
  } else {
    console.warn(
      "GOOGLE_PUBSUB_EMAIL ist nicht gesetzt – Zustellung ungeprüft " +
        "angenommen. Vor dem Launch setzen.",
    );
  }

  let rumpf: Record<string, unknown>;
  try {
    rumpf = await req.json();
  } catch {
    return json({ error: "Kein JSON." }, 400);
  }

  const nachricht = (rumpf.message ?? {}) as Record<string, unknown>;
  if (typeof nachricht.data !== "string") {
    return json({ error: "message.data fehlt." }, 400);
  }

  let meldung: Record<string, unknown>;
  try {
    meldung = JSON.parse(alsText(nachricht.data));
  } catch {
    return json({ error: "message.data ist kein JSON." }, 400);
  }

  if (meldung.packageName !== PAKET) {
    console.error(`Meldung für fremdes Paket: ${String(meldung.packageName)}`);
    return json({ error: "Andere App." }, 400);
  }

  // Probemeldung aus der Play Console. Kommt sie an, stimmt der ganze
  // Weg: Topic, Push-Abo, URL, Autorisierung.
  if (meldung.testNotification) {
    console.log("TEST-Notification von Google empfangen.");
    return json({ ok: true, art: "test" });
  }

  const abo = (meldung.subscriptionNotification ?? {}) as Record<string, unknown>;
  const storniert = (meldung.voidedPurchaseNotification ?? {}) as Record<string, unknown>;
  const kaufToken = typeof abo.purchaseToken === "string"
    ? abo.purchaseToken
    : typeof storniert.purchaseToken === "string"
    ? storniert.purchaseToken
    : "";

  if (!kaufToken) {
    // Einmalkäufe und alles andere geht uns nichts an.
    console.log("Meldung ohne Kauf-Token – nichts zu tun.");
    return json({ ok: true, gemacht: "nichts" });
  }

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: profil, error: suchFehler } = await sb
    .from("profiles")
    .select("id")
    .eq("store_platform", "google")
    .eq("store_transaction_id", kaufToken)
    .maybeSingle();

  if (suchFehler) {
    // Unsere Seite klemmt – 500, damit Pub/Sub es erneut zustellt.
    console.error("Profil-Suche fehlgeschlagen:", suchFehler.message);
    return json({ error: "Profil-Suche fehlgeschlagen." }, 500);
  }

  if (!profil) {
    // Kein Konto zu diesem Kauf. Wiederholen ändert daran nichts.
    console.log("Kein Profil zu diesem Kauf-Token.");
    return json({ ok: true, gemacht: "kein Profil" });
  }

  // Hier wird entschieden – und zwar von Google, nicht von der Meldung.
  let zustand;
  try {
    zustand = await pruefeGooglesAbo(
      DIENSTKONTO,
      PAKET,
      kaufToken,
      String(abo.subscriptionId ?? ""),
    );
  } catch (e) {
    // Google war nicht erreichbar oder das Dienstkonto fehlt. 500, damit
    // es erneut versucht wird – NICHT das Abo beenden. Ein Netzfehler
    // darf niemandem den Zugang nehmen.
    console.error("Play-API nicht erreichbar:", grund(e));
    return json({ error: "Play-API nicht erreichbar." }, 500);
  }

  if (!zustand.aktiv) {
    const { error } = await sb.rpc("abo_beenden", { nutzer: profil.id });
    if (error) {
      console.error("abo_beenden fehlgeschlagen:", error.message);
      return json({ error: "abo_beenden fehlgeschlagen." }, 500);
    }
    console.log(`Abo beendet für ${profil.id}.`);
    return json({ ok: true, gemacht: "beendet" });
  }

  const { error } = await sb.rpc("abo_setzen", {
    nutzer: profil.id,
    plattform: "google",
    produkt: zustand.produkt,
    transaktion: zustand.transaktion,
    laeuft_bis: zustand.laeuftBis,
  });

  if (error) {
    console.error("abo_setzen fehlgeschlagen:", error.message);
    return json({ error: "abo_setzen fehlgeschlagen." }, 500);
  }

  console.log(`Abo verlängert für ${profil.id}.`);
  return json({ ok: true, gemacht: "verlängert" });
});
