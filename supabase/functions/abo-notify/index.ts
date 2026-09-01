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
import "npm:reflect-metadata@0.2.2";
import * as x509 from "npm:@peculiar/x509@2.0.0";
import { APPLE_ROOT_CA_G3 } from "./apple-root-ca.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUNDLE_ID = Deno.env.get("APPLE_BUNDLE_ID") ?? "online.driftware.collectview";
// Sicherheitsschalter, gleiche Bedeutung wie in abo-pruefen: Sandbox-
// Käufe sind kostenlos. Steht er nicht auf true, werden Sandbox-
// Meldungen zwar geprüft, aber nicht umgesetzt – sonst schaltet sich ein
// Sandbox-Tester nach dem Launch ein echtes Abo frei.
const SANDBOX_ERLAUBT = Deno.env.get("APPLE_SANDBOX_ERLAUBT") === "true";

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

/* ---------- Signaturprüfung ----------

   Warum nicht Apples eigene Bibliothek: die prüft Ketten über Nodes
   crypto.X509Certificate. Deno liefert davon nur eine Hülle – weder
   .toString() noch .raw sind implementiert, die Prüfung scheitert mit
   VERIFICATION_FAILURE, obwohl an der Signatur nichts falsch ist.
   Dieselbe Meldung lief lokal unter Node anstandslos durch. Statt
   Löcher einzeln zu stopfen, steht die Prüfung hier ausgeschrieben,
   gegen eine Bibliothek, die in Deno wirklich läuft.

   Geprüft wird dasselbe wie bei Apple:
     1. ES256, Kette aus genau 3 Zertifikaten.
     2. Die mitgeschickte Wurzel MUSS Byte für Byte unsere sein.
     3. Zwischenzertifikat von der Wurzel, Blatt vom Zwischenzertifikat
        signiert – jeweils gültig zum Zeitpunkt der Meldung.
     4. Apples Zweck-OIDs auf beiden Zertifikaten. Ohne die Prüfung
        genügte irgendein von Apple ausgestelltes Zertifikat.
     5. Die JWS-Signatur selbst, mit dem Schlüssel des Blatts. */

const OID_ZWISCHEN = "1.2.840.113635.100.6.2.1";
const OID_BLATT = "1.2.840.113635.100.6.11.1";

const vonB64 = (t: string): Uint8Array =>
  Uint8Array.from(
    atob(t.replace(/-/g, "+").replace(/_/g, "/")),
    (z) => z.charCodeAt(0),
  );

const alsText = (t: string): string => new TextDecoder().decode(vonB64(t));

const gleicheBytes = (a: Uint8Array, b: Uint8Array): boolean =>
  a.length === b.length && a.every((z, i) => z === b[i]);

/**
 * Ein von Apple signiertes JWS prüfen und den Inhalt zurückgeben.
 *
 * Wirft bei allem, was nicht stimmt. Der Rückgabewert ist erst dann
 * etwas wert, wenn diese Funktion ohne Ausnahme zurückkehrt.
 */
async function pruefeUndLies(jws: string): Promise<Record<string, unknown>> {
  const [kopfB64, rumpfB64, sigB64] = jws.split(".");
  if (!kopfB64 || !rumpfB64 || !sigB64) throw new Error("kein JWS");

  const kopf = JSON.parse(alsText(kopfB64));
  if (kopf.alg !== "ES256") throw new Error(`Algorithmus ${kopf.alg}`);

  const kette = kopf.x5c;
  if (!Array.isArray(kette) || kette.length !== 3) {
    throw new Error("Kette hat nicht genau 3 Zertifikate");
  }

  const blatt = new x509.X509Certificate(vonB64(kette[0]));
  const zwischen = new x509.X509Certificate(vonB64(kette[1]));
  const wurzel = new x509.X509Certificate(APPLE_ROOT_CA_G3);

  // Die Wurzel aus der Meldung zählt nicht – unsere zählt. Der Vergleich
  // stellt nur sicher, dass die Kette überhaupt auf sie hinausläuft.
  if (!gleicheBytes(new Uint8Array(wurzel.rawData), vonB64(kette[2]))) {
    throw new Error("Wurzel der Meldung ist nicht Apples Wurzel");
  }

  const rumpf = JSON.parse(alsText(rumpfB64));
  const stand = new Date(Number(rumpf.signedDate ?? Date.now()));

  if (!await zwischen.verify({ publicKey: wurzel.publicKey, date: stand })) {
    throw new Error("Zwischenzertifikat nicht von Apples Wurzel");
  }
  if (!await blatt.verify({ publicKey: zwischen.publicKey, date: stand })) {
    throw new Error("Blatt nicht vom Zwischenzertifikat");
  }
  if (!zwischen.getExtension(OID_ZWISCHEN)) {
    throw new Error("Zwischenzertifikat ohne Apple-OID");
  }
  if (!blatt.getExtension(OID_BLATT)) {
    throw new Error("Blatt ohne Apple-OID");
  }

  const ok = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    await blatt.publicKey.export(),
    vonB64(sigB64),
    new TextEncoder().encode(`${kopfB64}.${rumpfB64}`),
  );
  if (!ok) throw new Error("Signatur stimmt nicht");

  return rumpf;
}

/**
 * Grund einer fehlgeschlagenen Prüfung lesbar machen.
 *
 * Unsere eigenen Fehler tragen ihn in `message`; was aus der
 * Zertifikatsbibliothek kommt, versteckt ihn gern eine Ebene tiefer in
 * `cause`. Ohne beides steht im Log eine nichtssagende Zeile – und
 * genau daran hat die Fehlersuche hier schon einmal gehangen.
 */
function grund(e: unknown): string {
  if (e && typeof e === "object") {
    const status = (e as { status?: unknown }).status;
    const name = (e as { name?: unknown }).name;
    const nachricht = (e as { message?: unknown }).message;
    // Der eigentliche Grund steckt fast immer in `cause` – ohne die
    // steht im Log nur "status 1" und man rät.
    const ursache = (e as { cause?: unknown }).cause;
    const teile = [name, status, nachricht].filter(Boolean);
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
    meldung = await pruefeUndLies(signedPayload);
  } catch (e) {
    // 400, nicht 500: eine Meldung, die wir nicht verifizieren können,
    // wird auch beim zehnten Versuch nicht echt. Apple soll sie nicht
    // endlos wiederholen.
    console.error("Signatur nicht gültig:", grund(e));
    return json({ error: "Signatur nicht gültig." }, 400);
  }

  // Apples Bibliothek prüfte das intern mit; jetzt steht es sichtbar da.
  // Ohne diese Zeile würde eine gültig signierte Meldung zu einer
  // FREMDEN App unsere Abos umschalten.
  const daten = (meldung.data ?? {}) as Record<string, unknown>;
  if (daten.bundleId !== BUNDLE_ID) {
    console.error(`Meldung für fremde App: ${String(daten.bundleId)}`);
    return json({ error: "Andere App." }, 400);
  }

  const umgebung = String(daten.environment ?? "");
  if (umgebung === "Sandbox" && !SANDBOX_ERLAUBT) {
    // Geprüft und echt, aber ein kostenloser Testkauf. Quittieren, damit
    // Apple nicht wiederholt – umsetzen wäre ein geschenktes Abo.
    console.log("Sandbox-Meldung ignoriert (APPLE_SANDBOX_ERLAUBT ist aus).");
    return json({ ok: true, gemacht: "nichts (Sandbox gesperrt)" });
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

  const signierteTransaktion = daten.signedTransactionInfo as string | undefined;
  if (!signierteTransaktion) {
    console.log(`${art} ohne Transaktion – nichts zu tun.`);
    return json({ ok: true, art, gemacht: "nichts" });
  }

  let transaktion;
  try {
    transaktion = await pruefeUndLies(signierteTransaktion);
  } catch (e) {
    console.error("Transaktion nicht prüfbar:", grund(e));
    return json({ error: "Transaktion nicht prüfbar." }, 400);
  }

  // Auch die Transaktion gehört zu unserer App – sonst könnte eine
  // gültig signierte fremde Transaktion mitgeschickt werden.
  if (transaktion.bundleId !== BUNDLE_ID) {
    console.error(`Transaktion für fremde App: ${String(transaktion.bundleId)}`);
    return json({ error: "Andere App." }, 400);
  }

  const beleg = typeof transaktion.originalTransactionId === "string"
    ? transaktion.originalTransactionId
    : "";
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
