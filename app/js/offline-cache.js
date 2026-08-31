/* =====================================================================
   offline-cache.js – Sammlung im Browser speichern, damit sie auch ohne
   Internetverbindung lesbar bleibt.

   Bewusst localStorage statt IndexedDB: die Sammlung ist eine einfache
   JSON-Liste, kein großes Binärformat, und localStorage ist synchron –
   kein zusätzliches await-Geflecht für einen Cache, der nur als
   Rückfallebene dient. Läuft in try/catch, weil localStorage im privaten
   Modus mancher Browser wirft, statt leer zu bleiben – dann eben kein
   Offline-Stand, aber die App bleibt nutzbar.
   ===================================================================== */

function offlineCacheKey(userId) {
  return `plattenregal:sammlung-offline:${userId}`;
}

/** Sammlung nach jedem erfolgreichen Laden hier ablegen. */
function saveOfflineCollection(userId, items) {
  try {
    localStorage.setItem(offlineCacheKey(userId), JSON.stringify({
      items,
      savedAt: Date.now(),
    }));
  } catch {
    // Kein Platz oder kein Zugriff (privater Modus) – dann eben ohne
    // Offline-Stand. Kein Grund, das Laden der Sammlung scheitern zu lassen.
  }
}

/** { items, savedAt } oder null, wenn (noch) nichts gespeichert ist. */
function loadOfflineCollection(userId) {
  try {
    const raw = localStorage.getItem(offlineCacheKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.items)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Einzelnen Eintrag aus dem letzten Offline-Stand holen (für detail.html). */
function loadOfflineItem(userId, itemId) {
  const cached = loadOfflineCollection(userId);
  if (!cached) return null;
  return cached.items.find((i) => i.id === itemId) || null;
}

/** "Stand vom 30.08., 14:03" – für den Offline-Hinweis. */
function offlineStandText(savedAt) {
  return new Date(savedAt).toLocaleString("de-DE", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}
