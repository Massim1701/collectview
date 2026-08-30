/* =====================================================================
   scan-limit.js – Free-Limit auf Scans: ohne Abo 5, mit Abo unbegrenzt.

   Eigene Datei, damit db.js unangetastet bleibt.

   Verbindlich ist der Trigger in db/scan-limit.sql. Was hier steht, ist
   die Anzeige davor und die Übersetzung der Fehlermeldung dahinter – ein
   Client-Check allein wäre mit den Entwicklerwerkzeugen zu umgehen.
   ===================================================================== */

/** Nur für die Anzeige "noch 3 von 5". Die harte Grenze zieht der Trigger. */
const FREE_SCAN_LIMIT = 5;

/** Erkennt die Absage des Triggers am Wortlaut aus db/scan-limit.sql. */
function isScanLimitError(error) {
  return !!error && /SCAN_LIMIT/.test(error.message || "");
}

/**
 * Scan protokollieren. Der Insert IST die Erlaubnis: lehnt der Trigger ab,
 * findet die Discogs-Suche gar nicht erst statt.
 *
 * Gibt { ok } zurück statt zu werfen – ein erschöpftes Kontingent ist der
 * Normalfall der kostenlosen Version, kein Ausnahmezustand.
 */
async function recordScan(userId, source, term) {
  const { error } = await sb
    .from("scan_events")
    .insert({ user_id: userId, source, term: term ? String(term) : null });

  if (!error) return { ok: true };
  if (isScanLimitError(error)) return { ok: false, limitReached: true };
  return { ok: false, limitReached: false, message: error.message };
}

/** Wie viele Scans hat der Nutzer schon verbraucht? */
async function fetchScanCount(userId) {
  const { count, error } = await sb
    .from("scan_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) throw error;
  return count || 0;
}

/** "Noch 3 von 5 freien Scans." – mit Abo bleibt die Zeile leer. */
function scanQuotaText(used, subscribed) {
  if (subscribed) return "";
  const left = Math.max(0, FREE_SCAN_LIMIT - used);
  if (left === 0) return `Keine freien Scans mehr (${FREE_SCAN_LIMIT} von ${FREE_SCAN_LIMIT} verbraucht).`;
  if (left === 1) return `Noch 1 von ${FREE_SCAN_LIMIT} freien Scans.`;
  return `Noch ${left} von ${FREE_SCAN_LIMIT} freien Scans.`;
}

/** Hinweis, wenn nichts mehr frei ist. */
function scanLimitNoticeMarkup() {
  return `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9"/><path d="M12 8v4.5M12 16h.01"/>
    </svg>
    <div class="notice-body">
      <strong>Die ${FREE_SCAN_LIMIT} freien Scans sind aufgebraucht</strong>
      <span>Mit Plattenregal Plus scannst du unbegrenzt weiter.</span>
      <a class="btn-secondary small" href="../wireframes/pricing.html">Plattenregal Plus ansehen</a>
    </div>`;
}
