/* =====================================================================
   currency.js – Umrechnung für den Marktplatz. Kurse kommen von
   frankfurter.app (EZB-Referenzkurse, kein Key nötig, CORS-offen) und
   werden pro Browser-Sitzung einmal geholt und für eine Stunde im
   sessionStorage zwischengespeichert – der Kurs ändert sich einmal
   täglich, ein Request pro Marktplatz-Besuch reicht dicke.
   Eigenständiges Modul wie marketplace.js: nutzt nichts von dort.
   ===================================================================== */

const MARKTPLATZ_WAEHRUNGEN = ["EUR", "USD", "GBP"];

const CURRENCY_CACHE_KEY = "cv_fx_rates_v1";
const CURRENCY_CACHE_MS = 60 * 60 * 1000;

/** { EUR: 1, USD: 1.16, GBP: 0.86, … } – immer bezogen auf EUR. */
async function fetchFxRates() {
  try {
    const cached = JSON.parse(sessionStorage.getItem(CURRENCY_CACHE_KEY) || "null");
    if (cached && Date.now() - cached.at < CURRENCY_CACHE_MS) return cached.rates;
  } catch {
    /* kaputter Cache-Eintrag ignorieren, neu holen */
  }

  const res = await fetch("https://api.frankfurter.dev/v1/latest?from=EUR");
  if (!res.ok) throw new Error("Wechselkurse nicht erreichbar.");
  const daten = await res.json();
  const rates = { EUR: 1, ...daten.rates };

  try {
    sessionStorage.setItem(CURRENCY_CACHE_KEY, JSON.stringify({ at: Date.now(), rates }));
  } catch {
    /* sessionStorage voll o. Ä. – dann eben ohne Cache */
  }
  return rates;
}

/** Rechnet Cent-Beträge zwischen den drei Marktplatz-Währungen um. */
function convertCents(cents, from, to, rates) {
  if (from === to || !rates[from] || !rates[to]) return cents;
  const eur = cents / rates[from];
  return Math.round(eur * rates[to]);
}

function formatMoney(cents, currency) {
  const amount = (cents || 0) / 100;
  try {
    return new Intl.NumberFormat("de-DE", { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

/**
 * Kleine graue Umrechnungszeile unter dem Preis, z. B. "≈ 54,20 $ · 47,30 £".
 * `rates` optional vorab geladen (Listen-Rendering holt sie einmal für
 * alle Karten); ohne rates wird bei Bedarf selbst geladen.
 */
async function fxHintMarkup(priceCents, currency, rates) {
  if (!priceCents) return "";
  try {
    const r = rates || (await fetchFxRates());
    const andere = MARKTPLATZ_WAEHRUNGEN.filter((c) => c !== currency);
    const teile = andere.map((c) => formatMoney(convertCents(priceCents, currency, c, r), c));
    return `≈ ${teile.join(" · ")}`;
  } catch {
    return "";
  }
}
