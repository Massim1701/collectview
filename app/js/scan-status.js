/* =====================================================================
   scan-status.js – Schritt 3 des Scan-Ablaufs: Abgleich eines Treffers
   mit der eigenen Sammlung und der Wunschliste.

   Eigene Datei, damit db.js unangetastet bleibt (wird parallel bearbeitet).

   Zum "parallel, nicht danach" aus der Spezifikation: die discogs_id
   steht erst fest, wenn Discogs geantwortet hat – danach zu fragen wäre
   per Definition nicht parallel. Der Barcode steht dagegen sofort fest,
   und collection_items speichert ihn mit. Deshalb zweistufig:

     1. sofort mit dem Scan: Sammlung nach Barcode (echtes Parallel)
     2. wenn Discogs antwortet: eine Sammelabfrage über alle Treffer-IDs

   Schritt 2 kostet keine spürbare Wartezeit, weil er für alle Treffer
   auf einmal läuft und die Trefferliste schon gezeichnet wird.
   ===================================================================== */

/** Leeres Ergebnis – auch der Fehlerfall sieht so aus, damit ein
    fehlender Abgleich den Scan nie blockiert. */
function emptyScanStatusData() {
  return { collection: [], wishlist: [] };
}

/** Sammlung nach Barcode. RLS filtert bereits auf den eigenen Nutzer. */
async function fetchCollectionByBarcode(barcode) {
  if (!barcode) return [];
  const { data, error } = await sb
    .from("collection_items")
    .select("id, title, quantity, discogs_id, barcode")
    .eq("barcode", String(barcode));
  if (error) throw error;
  return data || [];
}

/** Sammlung für mehrere Discogs-IDs auf einmal – eine Abfrage, nicht acht. */
async function fetchCollectionByDiscogsIds(ids) {
  const list = [...new Set(ids.filter((v) => v !== null && v !== undefined))].map(String);
  if (list.length === 0) return [];
  const { data, error } = await sb
    .from("collection_items")
    .select("id, title, quantity, discogs_id, barcode")
    .in("discogs_id", list);
  if (error) throw error;
  return data || [];
}

/**
 * Wunschliste für mehrere Discogs-IDs.
 *
 * Achtung: wishlist_items wird derzeit nirgends mit einer discogs_id
 * beschrieben – die Einträge entstehen von Hand auf wishlist.html. Der
 * Abgleich liefert deshalb heute in aller Regel nichts, und falls die
 * Spalte gar nicht existiert, antwortet Postgres mit 42703. Beides ist
 * kein Grund, den Scan scheitern zu lassen: dann eben ohne Wunschliste.
 */
async function fetchWishlistByDiscogsIds(ids) {
  const list = [...new Set(ids.filter((v) => v !== null && v !== undefined))].map(String);
  if (list.length === 0) return [];
  const { data, error } = await sb
    .from("wishlist_items")
    .select("id, title, discogs_id")
    .in("discogs_id", list);
  if (error) {
    if (error.code === "42703") return [];
    throw error;
  }
  return data || [];
}

/**
 * Status eines einzelnen Treffers. Reine Funktion über bereits geladene
 * Zeilen – kein Netz, damit sie sich testen lässt.
 *
 * Sammlung zählt als Treffer bei gleicher discogs_id ODER gleichem
 * Barcode: der Barcode-Weg greift auch bei Einträgen, die vor der
 * Discogs-Anbindung von Hand angelegt wurden.
 */
function scanStatusFor(result, data) {
  const { collection = [], wishlist = [] } = data || {};
  const sameId = (a, b) => a !== null && a !== undefined && b !== null && b !== undefined && String(a) === String(b);

  const inCollection =
    collection.find(
      (row) => sameId(row.discogs_id, result.discogs_id) || sameId(row.barcode, result.barcode),
    ) || null;

  const onWishlist = wishlist.find((row) => sameId(row.discogs_id, result.discogs_id)) || null;

  return { inCollection, onWishlist };
}

/** Anzahl aus einem Sammlungseintrag, robust gegen fehlende Spalte. */
function statusQuantity(row) {
  const n = Number(row && row.quantity);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

/**
 * Hinweisbanner über dem Ergebnis. Leer, wenn der Tonträger weder in der
 * Sammlung noch auf der Wunschliste steht – dann ist der Normalfall
 * "neu" und braucht keinen Kasten.
 */
function scanStatusMarkup(status) {
  if (status.inCollection) {
    const n = statusQuantity(status.inCollection);
    return `
      <div class="scan-status-note is-owned">
        <strong>Hast du schon (Menge: ${n})</strong>
        <a href="detail.html?id=${encodeURIComponent(status.inCollection.id)}">Zum Eintrag</a>
      </div>`;
  }
  if (status.onWishlist) {
    return `
      <div class="scan-status-note is-wished">
        <strong>Auf deiner Wunschliste</strong>
        <button class="btn-secondary small" type="button" data-action="wishlist-to-collection">
          In die Sammlung verschieben
        </button>
      </div>`;
  }
  return "";
}
