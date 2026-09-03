/* =====================================================================
   scan-history.js – Lokaler Scan-Verlauf für Gäste und nicht-abonnierte
   Nutzer: bis zu 100 Treffer im Browser (localStorage), nicht auf dem
   Server. Genau das ist der Punkt -- ohne Abo landet nichts in
   collection_items (RLS verlangt is_subscribed, siehe
   db/free-tier-gate.sql), aber wer schon eine Weile gescannt hat, soll
   seine Ausbeute nicht verlieren, wenn er sich später doch entscheidet.

   Kein Server-Backup: anderes Gerät, anderer Browser oder gelöschte
   Website-Daten heißt, der Verlauf ist weg. Für einen kostenlosen Köder
   ist das ein akzeptabler Kompromiss, kein Datenverlust im eigentlichen
   Sinn -- gespeichert (also wirklich gesichert) ist erst, was über
   „Zur Sammlung hinzufügen" wirklich in collection_items landet.
   ===================================================================== */

const SCAN_HISTORY_KEY = "cv_scan_history_v1";
const SCAN_HISTORY_MAX = 100;

/** Kaputtes/fremdes localStorage darf den Scanner nicht lahmlegen. */
function loadScanHistory() {
  try {
    const raw = localStorage.getItem(SCAN_HISTORY_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveScanHistoryList(list) {
  try {
    localStorage.setItem(SCAN_HISTORY_KEY, JSON.stringify(list));
  } catch {
    // Voller/gesperrter Speicher (privates Fenster o.ä.) -- der Scan
    // selbst ist trotzdem gelaufen, nur der Verlauf fehlt dann eben.
  }
}

/**
 * Neuesten Scan vorne einreihen, auf SCAN_HISTORY_MAX kappen.
 * `preis` ist das Ergebnis von discogsPreis() (discogs.js) oder null.
 */
function recordScanHistory(item, preis) {
  const list = loadScanHistory();
  const eintrag = {
    id: (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`),
    discogs_id: item.discogs_id || null,
    title: item.title,
    artist: item.artist || null,
    format: item.format || null,
    year: item.year || null,
    country: item.country || null,
    barcode: item.barcode || null,
    cover_url: item.cover_url || null,
    value_low: preis?.low ?? null,
    value_median: preis?.median ?? null,
    value_high: preis?.high ?? null,
    value_currency: preis?.currency ?? null,
    scanned_at: new Date().toISOString(),
  };
  list.unshift(eintrag);
  if (list.length > SCAN_HISTORY_MAX) list.length = SCAN_HISTORY_MAX;
  saveScanHistoryList(list);
  return list;
}

function removeScanHistoryEntry(id) {
  const list = loadScanHistory().filter((e) => e.id !== id);
  saveScanHistoryList(list);
  return list;
}
