/* =====================================================================
   discogs.js – eine Suche, zwei Strecken.

   Bevorzugt läuft jede Anfrage über die Edge Function discogs-suche:
   nur sie kennt den Token, und nur mit Token liefert Discogs überhaupt
   Cover-Bilder – ohne Token sind thumb und cover_image leere Strings.

   Ist die Funktion nicht erreichbar (nicht deployt, Token nicht gesetzt,
   gerade offline), geht die Anfrage direkt an Discogs wie bisher. Dann
   fehlen die Cover, aber der Scan läuft. Dieselbe Regel wie bei
   makeCodeReader in scanner.js: eine Verfeinerung darf das Kernstück
   der App nie lahmlegen.
   ===================================================================== */

const DISCOGS_PROXY = `${SUPABASE_URL}/functions/v1/discogs-suche`;

/**
 * Einmal als nicht verfügbar erkannt, nicht bei jedem Scan erneut
 * versuchen: das kostete sonst pro Scan eine tote Anfrage Wartezeit,
 * und beim Erfassen eines Regals summiert sich das.
 */
let proxyAus = false;

/** true, sobald eine Antwort tatsächlich über den Proxy kam – der
    Selbsttest kann damit sagen, ob Cover zu erwarten sind. */
let proxyBenutzt = false;

/**
 * Sucht bei Discogs. `params` ist { barcode } oder { q }.
 * Gibt eine Response zurück, damit die Aufrufer ihre bestehende
 * Behandlung von 429 und !ok unverändert weiterverwenden können.
 */
async function discogsSuche(params) {
  const query = new URLSearchParams({ ...params, type: "release" }).toString();

  if (!proxyAus) {
    try {
      const { data } = await sb.auth.getSession();
      const token = data?.session?.access_token;
      // Ohne Sitzung kein Proxy: die Funktion prüft das JWT, damit sie
      // nicht als offener Discogs-Zugang im Netz steht.
      if (token) {
        const res = await fetch(`${DISCOGS_PROXY}?${query}`, {
          headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
        });
        if (res.ok) {
          proxyBenutzt = true;
          return res;
        }
        // 429 gehört durchgereicht statt umgangen – der Direktweg
        // würde dasselbe Kontingent nur weiter belasten.
        if (res.status === 429) return res;
        // 404 = Funktion nicht deployt, 503 = Token fehlt. Beides ändert
        // sich nicht innerhalb einer Sitzung.
        if (res.status === 404 || res.status === 503) proxyAus = true;
      }
    } catch {
      // Netzfehler gegen die Funktion: einmal merken, dann Direktweg.
      proxyAus = true;
    }
  }

  return fetch(`https://api.discogs.com/database/search?${query}`);
}
