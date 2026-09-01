/* =====================================================================
   abo-notify – App Store Server Notifications V2 entgegennehmen.

   Warum es das braucht: abo-pruefen schaltet ein Abo frei, wenn der
   Client einen Beleg schickt. Danach fragt niemand mehr nach. Wer
   kündigt, dessen Zahlung scheitert oder wer sein Geld zurückbekommt,
   behielte subscription_status = 'active' auf ewig – die Schranken in
   db/scan-limit.sql und db/collection-limit.sql lesen genau dieses Feld.
   Apple meldet all das von sich aus, sobald diese URL in App Store
   Connect hinterlegt ist. Dies ist die Gegenrichtung zu abo-pruefen.

   Vertrauensfrage: der Rumpf kommt von einer offenen URL, jeder kann
   hier POSTen. Verbindlich ist allein die Signatur. Apple schickt ein
   JWS, dessen Zertifikatskette an Apples Wurzelzertifikat hängt
   (apple-root-ca.ts, im Repo festgenagelt). Erst nach erfolgreicher
   Prüfung wird irgendetwas geglaubt – notificationType, Transaktion,
   Ablaufdatum. Ungeprüft gelesen wird nur die Umgebung, und zwar
   ausschließlich, um den passenden Prüfer zu wählen; die Prüfung selbst
   findet danach trotzdem statt.

   Diese Function MUSS ohne JWT-Prüfung deployt werden – Apple kennt
   keine Supabase-Tokens und schickt keinen Authorization-Header:

     supabase functions deploy abo-notify --no-verify-jwt

   Das ist kein Loch: der Schutz ist die Signatur, nicht das Token. Wer
   ohne gültige Apple-Signatur POSTet, kommt keine Zeile weit.
   ===================================================================== */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { Buffer } from "node:buffer";
import {
  Environment,
  SignedDataVerifier,
} from "npm:@apple/app-store-server-library@3.1.0";
import { APPLE_ROOT_CA_G3 } from "./apple-root-ca.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUNDLE_ID = Deno.env.get("APPLE_BUNDLE_ID") ?? "online.driftware.collectview";
// Die numerische App-ID aus App Store Connect. Erst nötig, wenn die App
// live ist – für Produktions-Notifications verlangt Apples Bibliothek
// sie. Solange sie fehlt, werden nur Sandbox-Meldungen angenommen.
const APP_APPLE_ID = Number(Deno.env.get("APPLE_APP_APPLE_ID") ?? "") || undefined;

/* ---------- Was welche Meldung bedeutet ----------

   Bewusst knapp gehalten: nur was den Zugang wirklich ändert. Alles
   andere wird quittiert und ignoriert – eine Meldung, die wir nicht
   verstehen, darf niemandem sein Abo wegnehmen.

   Nicht in den Listen und das mit Absicht:
   - DID_CHANGE_RENEWAL_STATUS: jemand hat die Verlängerung abgeschaltet.
     Das Abo läuft bis zum Periodenende weiter. Wer hier beendet, nimmt
     bezahlte Zeit weg. Das Ende meldet Apple später als EXPIRED.
   - DID_FAIL_TO_RENEW: Zahlung klemmt, Apple versucht es weiter
     (Nachfrist). Endet es wirklich, kommt GRACE_PERIOD_EXPIRED oder
     EXPIRED. */

/** Zugang (wieder) aufmachen – die Laufzeit steht in der Transaktion. */
const AKTIVIEREN = new Set([
  "SUBSCRIBED",        // Erstkauf oder Rückkehr
  "DID_RENEW",         // verlängert
  "OFFER_REDEEMED",    // Angebot eingelöst
  "RENEWAL_EXTENDED",  // Apple hat die Laufzeit verlängert
  "RENEWAL_EXTENSION",
  "REFUND_REVERSED",   // Erstattung zurückgenommen
]);

/** Zugang zu – ab sofort. */
const BEENDEN = new Set([
  "EXPIRED",              // abgelaufen
  "GRACE_PERIOD_EXPIRED", // Nachfrist verstrichen, nie gezahlt
  "REFUND",               // Geld zurück
  "REVOKE",               // Familienfreigabe entzogen
]);

const pruefer = new Map<string, SignedDataVerifier>();

/** Prüfer je Umgebung, einmal gebaut. */
function holePruefer(umgebung: Environment): SignedDataVerifier {
  const schluessel = String(umgebung);
  const da = pruefer.get(schluessel);
  if (da) return da;

  // enableOnlineChecks = false: die Kette wird vollständig gegen das
  // festgenagelte Wurzelzertifikat geprüft, nur der Widerrufsstatus
  // (OCSP) wird nicht online abgefragt. Das spart einen Netzweg, der
  // sonst bei jeder Meldung scheitern könnte.
  const neu = new SignedDataVerifier(
    [Buffer.from(APPLE_ROOT_CA_G3)],
    false,
    umgebung,
    BUNDLE_ID,
    APP_APPLE_ID,
  );
  pruefer.set(schluessel, neu);
  return neu;
}

/**
 * Umgebung aus dem noch UNGEPRÜFTEN Rumpf lesen.
 *
 * Das ist harmlos und nötig: die Bibliothek will vorab wissen, gegen
 * welche Umgebung sie prüft. Wer hier lügt, gewinnt nichts – die
 * anschließende Signaturprüfung vergleicht die Umgebung mit dem
 * signierten Inhalt und schlägt fehl, wenn beides nicht zusammenpasst.
 */
function umgebungRaten(signedPayload: string): Environment {
  try {
    const mitte = signedPayload.split(".")[1];
    const roh = JSON.parse(atob(mitte.replace(/-/g, "+").replace(/_/g, "/")));
    return roh?.data?.environment === "Production"
      ? Environment.PRODUCTION
      : Environment.SANDBOX;
  } catch {
    return Environment.SANDBOX;
  }
}

/**
 * Grund einer fehlgeschlagenen Prüfung lesbar machen.
 *
 * Apples VerificationException trägt ihren Grund in `status`, nicht in
 * `message` – ein blankes catch protokolliert sonst eine leere Zeile
 * und man weiß im Ernstfall nicht, ob die Signatur falsch war, die
 * Umgebung nicht passte oder die Bibliothek selbst hochging.
 */
function grund(e: unknown): string {
  if (e && typeof e === "object") {
    const status = (e as { status?: unknown }).status;
    const name = (e as { name?: unknown }).name;
    const nachricht = (e as { message?: unknown }).message;
    return [name, status, nachricht].filter(Boolean).join(" / ") ||
      String(e);
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

  let signedPayload: string | undefined;
  try {
    signedPayload = (await req.json())?.signedPayload;
  } catch { /* kein JSON – gleich unten abgefangen */ }

  if (typeof signedPayload !== "string" || !signedPayload) {
    return json({ error: "signedPayload fehlt." }, 400);
  }

  // Ab hier gilt nur noch, was die Signatur deckt.
  let meldung;
  try {
    meldung = await holePruefer(umgebungRaten(signedPayload))
      .verifyAndDecodeNotification(signedPayload);
  } catch (e) {
    // 400, nicht 500: eine Meldung, die wir nicht verifizieren können,
    // wird auch beim zehnten Versuch nicht echt. Apple soll sie nicht
    // endlos wiederholen.
    console.error("Signatur nicht gültig:", grund(e));
    return json({ error: "Signatur nicht gültig." }, 400);
  }

  const art = String(meldung.notificationType ?? "");
  const unterart = String(meldung.subtype ?? "");

  // Die Probemeldung aus App Store Connect bzw. der Server-API. Kommt
  // sie hier an, stimmt die ganze Kette: URL, Erreichbarkeit, Signatur.
  if (art === "TEST") {
    console.log("TEST-Notification empfangen und verifiziert.");
    return json({ ok: true, art });
  }

  const aktivieren = AKTIVIEREN.has(art);
  const beenden = BEENDEN.has(art);
  if (!aktivieren && !beenden) {
    console.log(`Ignoriert: ${art}${unterart ? ` / ${unterart}` : ""}`);
    return json({ ok: true, art, gemacht: "nichts" });
  }

  const signierteTransaktion = meldung.data?.signedTransactionInfo;
  if (!signierteTransaktion) {
    console.log(`${art} ohne Transaktion – nichts zu tun.`);
    return json({ ok: true, art, gemacht: "nichts" });
  }

  let transaktion;
  try {
    transaktion = await holePruefer(umgebungRaten(signedPayload))
      .verifyAndDecodeTransaction(signierteTransaktion);
  } catch (e) {
    console.error("Transaktion nicht prüfbar:", grund(e));
    return json({ error: "Transaktion nicht prüfbar." }, 400);
  }

  const beleg = transaktion.originalTransactionId;
  if (!beleg) return json({ ok: true, art, gemacht: "nichts" });

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Der Beleg ist der Schlüssel: abo_setzen speichert genau die
  // originalTransactionId, die Apple hier wieder mitschickt.
  const { data: profil, error: suchFehler } = await sb
    .from("profiles")
    .select("id")
    .eq("store_platform", "apple")
    .eq("store_transaction_id", beleg)
    .maybeSingle();

  if (suchFehler) {
    // Unsere Seite klemmt – 500, damit Apple es erneut versucht.
    console.error("Profil-Suche fehlgeschlagen:", suchFehler.message);
    return json({ error: "Profil-Suche fehlgeschlagen." }, 500);
  }

  if (!profil) {
    // Kein Konto zu diesem Kauf: jemand hat gekauft, ohne dass
    // abo-pruefen je lief, oder das Konto ist gelöscht. Wiederholen
    // ändert daran nichts, also quittieren und protokollieren.
    console.log(`${art}: kein Profil zu Beleg ${beleg}.`);
    return json({ ok: true, art, gemacht: "kein Profil" });
  }

  // Eine zurückgenommene Transaktion ist nie aktiv, egal was die Art sagt.
  const widerrufen = !!transaktion.revocationDate;

  if (beenden || widerrufen) {
    const { error } = await sb.rpc("abo_beenden", { nutzer: profil.id });
    if (error) {
      console.error("abo_beenden fehlgeschlagen:", error.message);
      return json({ error: "abo_beenden fehlgeschlagen." }, 500);
    }
    console.log(`${art}: Abo beendet für ${profil.id}.`);
    return json({ ok: true, art, gemacht: "beendet" });
  }

  const { error } = await sb.rpc("abo_setzen", {
    nutzer: profil.id,
    plattform: "apple",
    produkt: String(transaktion.productId ?? ""),
    transaktion: beleg,
    laeuft_bis: new Date(Number(transaktion.expiresDate ?? 0)).toISOString(),
  });

  if (error) {
    console.error("abo_setzen fehlgeschlagen:", error.message);
    return json({ error: "abo_setzen fehlgeschlagen." }, 500);
  }

  console.log(`${art}: Abo verlängert für ${profil.id}.`);
  return json({ ok: true, art, gemacht: "verlängert" });
});
