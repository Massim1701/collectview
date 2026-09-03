/* =====================================================================
   scan-limit.js – Scannen ist seit dem Free-Scan-Pivot unbegrenzt und
   ohne Konto möglich (siehe db/scan-limit-unlimited.sql, das den alten
   5-Scans-Trigger entfernt hat). Nur das Speichern in die Sammlung ist
   CollectView Plus vorbehalten (RLS, siehe db/free-tier-gate.sql).

   Diese Datei protokolliert Scans weiterhin (scan_events, fürs Analytics)
   und übersetzt eine SCAN_LIMIT-Fehlermeldung, falls doch mal ein alter
   Trigger aktiv sein sollte -- im Normalfall passiert das nicht mehr.

   Eigene Datei, damit db.js unangetastet bleibt.
   ===================================================================== */

/** Historisch: frühere harte Grenze. Wird nur noch als Fallback-Text genutzt. */
const FREE_SCAN_LIMIT = 5;

/** Erkennt die Absage des Triggers am Wortlaut aus db/scan-limit.sql. */
function isScanLimitError(error) {
  return !!error && /SCAN_LIMIT/.test(error.message || "");
}

/**
 * Gibt es die Tabelle überhaupt? PostgREST meldet das als PGRST205.
 *
 * Der Fall ist real: db/scan-limit.sql muss von Hand im SQL-Editor
 * ausgeführt werden, und solange das nicht passiert ist, gibt es
 * scan_events nicht.
 */
function isMissingTableError(error) {
  return !!error && (error.code === "PGRST205" || /Could not find the table/i.test(error.message || ""));
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

  // Fehlt die Tabelle, lässt sich nichts zählen – aber deswegen die App
  // zu blockieren wäre die falsche Richtung. Ein nicht eingerichteter
  // Zähler ist ein Betriebsfehler, kein Missbrauch; das Limit auf die
  // Sammlung greift ohnehin weiter (Trigger aus 69a68bc). Also
  // durchlassen und den Scan als ungezählt melden.
  if (isMissingTableError(error)) return { ok: true, ungezaehlt: true };

  return { ok: false, limitReached: false, message: error.message };
}

/** Wie viele Scans hat der Nutzer schon verbraucht? */
async function fetchScanCount(userId) {
  const { count, error } = await sb
    .from("scan_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  // Ohne Tabelle gibt es keinen Stand – null heißt "unbekannt", nicht "null Scans".
  if (isMissingTableError(error)) return null;
  if (error) throw error;
  return count || 0;
}

/**
 * Free-Hinweis unter dem Scan-Bereich. Scannen (Kamera wie auch das
 * manuelle Code-Formular) ist unbegrenzt und ohne Konto möglich; nur
 * das dauerhafte Speichern in die Sammlung ist CollectView Plus
 * vorbehalten (RLS-Regel, siehe db/free-tier-gate.sql). Bis dahin merkt
 * scan-history.js die letzten Treffer lokal im Browser.
 */
function freeTierHintText(subscribed) {
  if (subscribed) return "";
  return "Scannen ist komplett kostenlos, auch ohne Konto. Zum dauerhaften Speichern in deine Sammlung brauchst du CollectView Plus.";
}

/** Fallback-Hinweis, falls ein Backend doch mal ein Scan-Limit meldet. */
function scanLimitNoticeMarkup() {
  return `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9"/><path d="M12 8v4.5M12 16h.01"/>
    </svg>
    <div class="notice-body">
      <strong>Gerade sind keine weiteren Scans möglich</strong>
      <span>Bitte versuch es in Kürze erneut, oder hol dir CollectView Plus.</span>
      <a class="btn-secondary small" href="../wireframes/pricing.html">CollectView Plus ansehen</a>
    </div>`;
}
