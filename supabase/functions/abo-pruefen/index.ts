/* =====================================================================
   abo-pruefen – einen In-App-Kauf prüfen und das Abo freischalten.

   Warum serverseitig: der Client darf niemals sagen dürfen "ich habe
   bezahlt". protect_subscription_fields() in db/abo.sql setzt jedes
   Update der Abo-Felder zurück, das nicht von service_role kommt – diese
   Function ist der einzige Weg an subscription_status heran.

   Ablauf:
     1. Wer ruft? Aus dem JWT, nicht aus dem Rumpf. Ein mitgeschickter
        Nutzer wäre frei wählbar.
     2. Beleg beim Store prüfen. Apple und Google beantworten das
        verbindlich; alles andere wäre geraten.
     3. abo_setzen() per service_role.

   Was hier NICHT steht: Preise, Produktnamen, Laufzeiten. Die kommen aus
   der Antwort des Stores. Alles, was der Client behauptet, gilt nur als
   Hinweis, welchen Store wir fragen sollen.

   ACHTUNG, Stand der Prüfung: die beiden Store-Abfragen sind gegen die
   Dokumentation geschrieben, aber noch nie gegen einen echten Kauf
   gelaufen – dafür braucht es Produkte in App Store Connect und in der
   Play Console sowie die Schlüssel unten. Bis dahin ist alles ab
   Schritt 2 ungeprüft.
   ===================================================================== */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { pruefeGooglesAbo } from "../_shared/google-play.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Apple: App Store Connect -> Integrationen -> In-App-Kauf-Schlüssel.
const APPLE_KEY_ID = Deno.env.get("APPLE_KEY_ID");
const APPLE_ISSUER_ID = Deno.env.get("APPLE_ISSUER_ID");
const APPLE_PRIVATE_KEY = Deno.env.get("APPLE_PRIVATE_KEY"); // .p8, PEM
const APPLE_BUNDLE_ID = Deno.env.get("APPLE_BUNDLE_ID") ?? "online.driftware.collectview";
// Sicherheitsschalter: Sandbox-Käufe sind kostenlose Testkäufe. Vor dem
// echten Launch MUSS das auf false stehen, sonst kann sich jeder mit
// einem Sandbox-Tester-Account ein echtes Abo freischalten. Während der
// Entwicklung/TestFlight-Phase explizit auf "true" setzen.
const APPLE_SANDBOX_ERLAUBT = Deno.env.get("APPLE_SANDBOX_ERLAUBT") === "true";

// Google: Dienstkonto mit Zugriff auf die Play Developer API, JSON als String.
const GOOGLE_SERVICE_ACCOUNT = Deno.env.get("GOOGLE_PLAY_SERVICE_ACCOUNT");
const ANDROID_PACKAGE = Deno.env.get("ANDROID_PACKAGE") ?? "online.driftware.collectview";

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

/* ---------- Signieren ---------- */

function base64url(daten: Uint8Array | string): string {
  const roh = typeof daten === "string" ? daten : String.fromCharCode(...daten);
  return btoa(roh).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** PEM (-----BEGIN PRIVATE KEY-----) zu den rohen DER-Bytes. */
function pemZuBytes(pem: string): Uint8Array {
  const kern = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  return Uint8Array.from(atob(kern), (c) => c.charCodeAt(0));
}

/**
 * ES256-JWT für Apple signieren.
 *
 * Konnte früher auch RS256, weil Google hier mitsignierte. Seit die
 * Play-Abfrage in _shared/google-play.ts liegt, gibt es dafür keinen
 * Aufrufer mehr – und ein ungenutzter Zweig ausgerechnet in einer
 * Signierfunktion ist nichts, was man aus Bequemlichkeit stehen lässt.
 */
async function signiereJwt(
  kopf: Record<string, unknown>,
  nutzlast: Record<string, unknown>,
  pem: string,
): Promise<string> {
  const schluessel = await crypto.subtle.importKey(
    "pkcs8",
    pemZuBytes(pem),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const daten = `${base64url(JSON.stringify(kopf))}.${base64url(JSON.stringify(nutzlast))}`;
  const signatur = new Uint8Array(await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    schluessel,
    new TextEncoder().encode(daten),
  ));

  return `${daten}.${base64url(signatur)}`;
}

/* ---------- Apple ----------
   Der Client schickt die originalTransactionId aus StoreKit. Die App
   Store Server API sagt, ob dazu ein gültiges Abo läuft und bis wann. */

async function pruefeApple(transaktion: string) {
  if (!APPLE_KEY_ID || !APPLE_ISSUER_ID || !APPLE_PRIVATE_KEY) {
    throw new Error("Apple-Schlüssel sind nicht gesetzt.");
  }

  const jetzt = Math.floor(Date.now() / 1000);
  const token = await signiereJwt(
    { alg: "ES256", kid: APPLE_KEY_ID, typ: "JWT" },
    {
      iss: APPLE_ISSUER_ID,
      iat: jetzt,
      exp: jetzt + 600,          // Apple lässt höchstens 60 Minuten zu
      aud: "appstoreconnect-v1",
      bid: APPLE_BUNDLE_ID,
    },
    APPLE_PRIVATE_KEY,
  );

  // Erst Produktion versuchen. Apple beantwortet eine Sandbox-Transaktion
  // dort mit 401 (nicht 404) – laut Doku dann mit der Sandbox-Basis-URL
  // erneut versuchen, statt das als Auth-Fehler zu werten. Sandbox nur,
  // wenn APPLE_SANDBOX_ERLAUBT=true gesetzt ist (siehe oben).
  const basisUrls = [
    "https://api.storekit.itunes.apple.com",
    ...(APPLE_SANDBOX_ERLAUBT ? ["https://api.storekit-sandbox.itunes.apple.com"] : []),
  ];

  let res: Response | null = null;
  for (const basis of basisUrls) {
    res = await fetch(
      `${basis}/inApps/v1/subscriptions/${encodeURIComponent(transaktion)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (res.status !== 401) break; // 404 (nicht gefunden) oder Erfolg -> richtige Umgebung getroffen
  }
  if (!res || !res.ok) throw new Error(`Apple antwortete mit ${res?.status}`);

  const daten = await res.json();

  // Die Antwort ist nach Produktgruppen geschachtelt. Uns interessiert
  // der jüngste Eintrag mit Status 1 (aktiv) oder 2 (Verlängerung
  // fehlgeschlagen, aber noch in der Nachfrist).
  const eintrag = (daten.data ?? [])
    .flatMap((gruppe: { lastTransactions?: unknown[] }) => gruppe.lastTransactions ?? [])
    .find((t: { status?: number }) => t.status === 1 || t.status === 2);

  if (!eintrag) return { aktiv: false as const };

  // signedTransactionInfo ist ein JWS. Die Nutzlast ist auch ohne
  // Signaturprüfung lesbar – und wir haben die Auskunft ohnehin direkt
  // von Apple über eine authentifizierte Verbindung geholt, nicht vom
  // Client. Die Signatur würde hier nichts hinzufügen.
  const nutzlast = JSON.parse(
    atob(String(eintrag.signedTransactionInfo).split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
  );

  return {
    aktiv: true as const,
    produkt: String(nutzlast.productId ?? ""),
    transaktion: String(nutzlast.originalTransactionId ?? transaktion),
    laeuftBis: new Date(Number(nutzlast.expiresDate ?? 0)).toISOString(),
    umgebung: String(nutzlast.environment ?? ""), // "Production" oder "Sandbox"
  };
}

/* ---------- Google ----------
   Der Client schickt den purchaseToken; verbindlich ist allein, was die
   Play Developer API dazu sagt. Die Abfrage stand bis zum 02.09.2026
   hier ausgeschrieben und ein zweites Mal in abo-notify-google. Zwei
   Kopien derselben Entscheidung driften auseinander – gerade an der
   Stelle, die bestimmt, wer ein Abo hat. Sie liegt jetzt einmal in
   _shared/google-play.ts. */

/* ---------- Einstieg ---------- */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST erwartet." }, 405);

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "Anmeldung nötig." }, 401);

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Wer ruft, kommt aus dem Token – nie aus dem Rumpf. Ein mitgesendeter
  // Nutzer wäre frei wählbar und damit ein geschenktes Abo für jeden.
  const { data: nutzerDaten, error: nutzerFehler } = await sb.auth.getUser(jwt);
  if (nutzerFehler || !nutzerDaten?.user) return json({ error: "Anmeldung ungültig." }, 401);
  const nutzer = nutzerDaten.user.id;

  let plattform: string, beleg: string, produkt: string;
  try {
    const rumpf = await req.json();
    plattform = String(rumpf.plattform ?? "");
    beleg = String(rumpf.beleg ?? "");
    produkt = String(rumpf.produkt ?? "");
  } catch {
    return json({ error: "Ungültiger Rumpf." }, 400);
  }

  if (plattform !== "apple" && plattform !== "google") {
    return json({ error: "plattform muss 'apple' oder 'google' sein." }, 400);
  }
  if (!beleg) return json({ error: "beleg fehlt." }, 400);

  let ergebnis;
  try {
    ergebnis = plattform === "apple"
      ? await pruefeApple(beleg)
      : await pruefeGooglesAbo(GOOGLE_SERVICE_ACCOUNT, ANDROID_PACKAGE, beleg, produkt);
  } catch (e) {
    // Der Store war nicht erreichbar oder die Schlüssel fehlen. Das ist
    // ein Betriebsfehler, kein Betrugsversuch – entsprechend melden,
    // damit die App den Unterschied anzeigen kann.
    return json({ error: `Beleg konnte nicht geprüft werden: ${e.message}` }, 502);
  }

  if (!ergebnis.aktiv) {
    await sb.rpc("abo_beenden", { nutzer });
    return json({ abo: false, grund: "Zu diesem Kauf läuft kein aktives Abo." });
  }

  const { error } = await sb.rpc("abo_setzen", {
    nutzer,
    plattform,
    produkt: ergebnis.produkt,
    transaktion: ergebnis.transaktion,
    laeuft_bis: ergebnis.laeuftBis,
  });

  if (error) {
    // ABO_BELEG_GEHOERT_ANDEREM_KONTO ist der interessante Fall: ein
    // weitergegebener Kauf. Gehört als eigene Meldung durchgereicht,
    // nicht als "irgendwas ging schief".
    const gehoertAnderem = /ABO_BELEG_GEHOERT_ANDEREM_KONTO/.test(error.message);
    return json({
      error: gehoertAnderem
        ? "Dieser Kauf ist bereits einem anderen Konto zugeordnet."
        : error.message,
    }, gehoertAnderem ? 409 : 500);
  }

  return json({ abo: true, produkt: ergebnis.produkt, laeuftBis: ergebnis.laeuftBis });
});
