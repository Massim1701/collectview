/* =====================================================================
   abo.js – Abo kaufen und den Kauf serverseitig bestätigen lassen.

   Die Aufteilung ist der Kern: der Client löst den Kauf aus und reicht
   den Beleg weiter, mehr nicht. Ob bezahlt wurde, entscheidet
   ausschließlich die Edge Function abo-pruefen gegen Apple bzw. Google.
   Ein Client, der "ich habe bezahlt" sagen dürfte, wäre wertlos –
   protect_subscription_fields() in db/abo.sql weist jedes Update der
   Abo-Felder ab, das nicht von service_role kommt.

   Drei Wege durch diese Datei:

     Nativ mit Store     kaufeAbo()  ->  Beleg  ->  meldeKaufAn()
     Nativ, Kauf früher  aboWiederherstellen()   ->  meldeKaufAn()
     Browser             gar nicht – Kaufen geht nur in der App

   Der Wiederherstellen-Weg ist keine Kür: Apple verlangt ihn für jede
   App mit Abo. Wer das Gerät wechselt oder die App neu lädt, muss ohne
   erneute Zahlung an sein Abo kommen.
   ===================================================================== */

/**
 * Produkt-IDs. Müssen ZEICHENGENAU denen in App Store Connect und der
 * Play Console entsprechen – ein Tippfehler äußert sich als "Produkt
 * nicht gefunden", nicht als Fehlermeldung mit Hinweis.
 */
const ABO_PRODUKTE = {
  monatlich: "collectview.plus.monatlich",
  jaehrlich: "collectview.plus.jaehrlich",
};

const ABO_PRUEFEN_URL = `${SUPABASE_URL}/functions/v1/abo-pruefen`;

/** "apple", "google" – oder null im Browser. */
function storePlattform() {
  const p = window.Capacitor?.getPlatform?.();
  if (p === "ios") return "apple";
  if (p === "android") return "google";
  return null;
}

/** Ist eine Kaufschnittstelle da? Im Browser nie. */
function storeVerfuegbar() {
  return !!storePlattform() && typeof CdvPurchase !== "undefined" && !!CdvPurchase.store;
}

/**
 * Beleg beim Server prüfen lassen.
 *
 * Gibt { abo: true, produkt, laeuftBis } zurück oder wirft mit einer
 * Meldung, die man einem Menschen zeigen kann. Der interessante
 * Fehlerfall ist 409: der Kauf gehört bereits einem anderen Konto –
 * jemand hat einen Beleg weitergegeben. Das gehört klar benannt, sonst
 * sucht der Nutzer den Fehler bei sich.
 */
async function meldeKaufAn(plattform, beleg, produkt) {
  const { data } = await sb.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error("Bitte zuerst anmelden.");

  const res = await fetch(ABO_PRUEFEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ plattform, beleg, produkt }),
  });

  let antwort = {};
  try { antwort = await res.json(); } catch { /* leerer Rumpf ist auch eine Antwort */ }

  if (res.status === 404 || res.status === 503) {
    throw new Error("Die Kaufprüfung ist noch nicht eingerichtet. Bitte später erneut versuchen.");
  }
  if (res.status === 409) {
    throw new Error(antwort.error || "Dieser Kauf gehört bereits zu einem anderen Konto.");
  }
  if (!res.ok) {
    throw new Error(antwort.error || `Die Prüfung schlug fehl (${res.status}).`);
  }
  if (!antwort.abo) {
    throw new Error(antwort.grund || "Zu diesem Kauf läuft kein aktives Abo.");
  }
  return antwort;
}

/* ---------- Store-Anbindung ----------
   ACHTUNG: die beiden folgenden Funktionen sprechen mit
   cordova-plugin-purchase (CdvPurchase, v13). Sie sind gegen dessen
   Dokumentation geschrieben und noch nie gelaufen – das Plugin ist
   nicht installiert und die Produkte existieren in keinem Store. Alles
   davor und danach (meldeKaufAn, die Fehlerbehandlung, der Ablauf auf
   der Preisseite) ist dagegen geprüft.

   Sobald das Plugin da ist, ist genau hier die Stelle, die als Erstes
   auf einem Gerät nachgeprüft gehört. */

let storeBereit = false;

/** Plugin einmal hochfahren und die beiden Produkte anmelden. */
async function storeStarten() {
  if (storeBereit) return;

  const store = CdvPurchase.store;
  const plattform = storePlattform() === "apple"
    ? CdvPurchase.Platform.APPLE_APPSTORE
    : CdvPurchase.Platform.GOOGLE_PLAY;

  store.register(Object.values(ABO_PRODUKTE).map((id) => ({
    id,
    type: CdvPurchase.ProductType.PAID_SUBSCRIPTION,
    platform: plattform,
  })));

  await store.initialize([plattform]);
  storeBereit = true;
}

/**
 * Kauf auslösen. Löst die Bezahlung beim Store aus und gibt den Beleg
 * zurück, sobald der Kauf genehmigt ist.
 *
 * Der Beleg ist bei Apple die originalTransactionId, bei Google der
 * purchaseToken – beide bleiben über die Laufzeit des Abos stabil und
 * sind deshalb der Schlüssel, unter dem db/abo.sql den Kauf führt.
 */
async function storeKaufAusloesen(produktId) {
  await storeStarten();
  const store = CdvPurchase.store;

  return new Promise((erfuellen, ablehnen) => {
    store.when()
      .approved((transaktion) => {
        const beleg = storePlattform() === "apple"
          ? transaktion.transactionId
          : transaktion.purchaseId || transaktion.transactionId;
        // finish() erst NACH unserer Prüfung: bis dahin gilt der Kauf
        // beim Store als offen und wird bei einem Absturz erneut
        // zugestellt. Genau das soll er.
        erfuellen({ beleg, transaktion });
      })
      .receiptsReady(() => { /* nur zum Aufwachen */ });

    store.error((fehler) => ablehnen(new Error(fehler?.message || "Der Kauf wurde abgebrochen.")));

    const angebot = store.get(produktId)?.getOffer();
    if (!angebot) {
      ablehnen(new Error("Dieses Abo ist im Store gerade nicht verfügbar."));
      return;
    }
    store.order(angebot).catch(ablehnen);
  });
}

/* ---------- Was die Oberfläche aufruft ---------- */

/**
 * Abo kaufen. `zyklus` ist "monatlich" oder "jaehrlich".
 *
 * Wirft mit einer anzeigbaren Meldung, statt still zu scheitern – ein
 * abgebrochener Kauf ist der Normalfall, kein Ausnahmezustand.
 */
async function kaufeAbo(zyklus) {
  const produktId = ABO_PRODUKTE[zyklus];
  if (!produktId) throw new Error("Unbekannter Abo-Zeitraum.");

  const plattform = storePlattform();
  if (!plattform) {
    throw new Error("Das Abo lässt sich nur in der App kaufen, nicht im Browser.");
  }
  if (!storeVerfuegbar()) {
    throw new Error("Die Kaufschnittstelle des Stores ist nicht verfügbar.");
  }

  const { beleg, transaktion } = await storeKaufAusloesen(produktId);
  const ergebnis = await meldeKaufAn(plattform, beleg, produktId);

  // Erst jetzt abschließen: der Store darf den Kauf als erledigt
  // verbuchen, nachdem wir ihn gutgeschrieben haben.
  try { await transaktion?.finish?.(); } catch { /* der Store wiederholt sonst */ }

  return ergebnis;
}

/**
 * Früheren Kauf wiederherstellen – Gerätewechsel, Neuinstallation.
 * Apple verlangt diesen Weg für jede App mit Abo.
 */
async function aboWiederherstellen() {
  const plattform = storePlattform();
  if (!plattform || !storeVerfuegbar()) {
    throw new Error("Wiederherstellen geht nur in der App.");
  }

  await storeStarten();
  await CdvPurchase.store.restorePurchases();

  const kauf = Object.values(ABO_PRODUKTE)
    .map((id) => CdvPurchase.store.get(id))
    .find((p) => p?.owned);

  if (!kauf) throw new Error("Es wurde kein früherer Kauf gefunden.");

  const transaktion = kauf.transaction || {};
  const beleg = plattform === "apple"
    ? transaktion.transactionId
    : transaktion.purchaseId || transaktion.transactionId;

  return meldeKaufAn(plattform, beleg, kauf.id);
}
