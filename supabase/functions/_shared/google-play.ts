/* =====================================================================
   google-play.ts – den Zustand eines Play-Abos bei Google erfragen.

   Zwei Functions brauchen dieselbe Antwort: abo-pruefen (der Client legt
   einen Beleg vor) und abo-notify-google (Google meldet eine Änderung).
   Beide dürfen nur eines glauben – was die Play Developer API sagt.
   Deshalb steht die Abfrage hier einmal statt zweimal: zwei Kopien
   driften auseinander, und die Stelle, an der entschieden wird, wer ein
   Abo hat, ist die letzte, an der man das gebrauchen kann.
   ===================================================================== */

function base64url(daten: Uint8Array | string): string {
  const roh = typeof daten === "string" ? daten : String.fromCharCode(...daten);
  return btoa(roh).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** PEM (-----BEGIN PRIVATE KEY-----) zu den rohen DER-Bytes. */
function pemZuBytes(pem: string): Uint8Array {
  const kern = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  return Uint8Array.from(atob(kern), (c) => c.charCodeAt(0));
}

/** Dienstkonto-JWT bauen und gegen ein Zugriffstoken eintauschen. */
async function holeZugriffstoken(dienstkontoJson: string): Promise<string> {
  const konto = JSON.parse(dienstkontoJson);
  const jetzt = Math.floor(Date.now() / 1000);

  const schluessel = await crypto.subtle.importKey(
    "pkcs8",
    pemZuBytes(konto.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const daten = `${base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.` +
    base64url(JSON.stringify({
      iss: konto.client_email,
      scope: "https://www.googleapis.com/auth/androidpublisher",
      aud: "https://oauth2.googleapis.com/token",
      iat: jetzt,
      exp: jetzt + 3600,
    }));

  const signatur = new Uint8Array(await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    schluessel,
    new TextEncoder().encode(daten),
  ));

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${daten}.${base64url(signatur)}`,
    }),
  });
  if (!res.ok) throw new Error(`Google-Anmeldung scheiterte mit ${res.status}`);

  const { access_token } = await res.json();
  return access_token;
}

export type AboZustand =
  | { aktiv: false }
  | { aktiv: true; produkt: string; transaktion: string; laeuftBis: string };

/**
 * Den verbindlichen Zustand eines Abos holen.
 *
 * `fallbackProdukt` wird nur benutzt, wenn Google ausnahmsweise keine
 * Produkt-ID mitschickt – behauptet wird damit nichts, die Entscheidung
 * aktiv/nicht aktiv trifft allein Google.
 */
export async function pruefeGooglesAbo(
  dienstkontoJson: string | undefined,
  paket: string,
  kaufToken: string,
  fallbackProdukt = "",
): Promise<AboZustand> {
  if (!dienstkontoJson) throw new Error("Google-Dienstkonto ist nicht gesetzt.");

  const zugriff = await holeZugriffstoken(dienstkontoJson);

  const res = await fetch(
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/` +
      `${paket}/purchases/subscriptionsv2/tokens/${encodeURIComponent(kaufToken)}`,
    { headers: { Authorization: `Bearer ${zugriff}` } },
  );
  if (!res.ok) throw new Error(`Google antwortete mit ${res.status}`);

  const daten = await res.json();
  const zustand = String(daten.subscriptionState ?? "");

  // Nachfrist zählt als aktiv: die Zahlung klemmt, der Zugang bleibt.
  // Genauso wie bei Apple – wer hier abschaltet, sperrt zahlende Leute
  // wegen einer abgelaufenen Kreditkarte aus.
  const aktiv = zustand === "SUBSCRIPTION_STATE_ACTIVE" ||
    zustand === "SUBSCRIPTION_STATE_IN_GRACE_PERIOD";
  if (!aktiv) return { aktiv: false };

  const zeile = (daten.lineItems ?? [])[0] ?? {};
  return {
    aktiv: true,
    produkt: String(zeile.productId ?? fallbackProdukt),
    // Der purchaseToken bleibt über die Laufzeit stabil und ist damit
    // der dauerhafte Schlüssel für diesen Kauf.
    transaktion: kaufToken,
    laeuftBis: String(zeile.expiryTime ?? daten.expiryTime ?? ""),
  };
}
