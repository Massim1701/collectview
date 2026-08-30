/* =====================================================================
   releases.js – Zugriff auf den gemeinsamen Tonträger-Katalog.

   Eigene Datei, damit db.js unangetastet bleibt (wird parallel bearbeitet).

   Der Katalog trennt "was ist diese Platte" von "wer besitzt sie".
   Praktischer Gewinn: Discogs muss pro Platte einmal gefragt werden
   statt einmal pro Nutzer. Bei 25 Anfragen pro Minute und IP ist das
   der Unterschied zwischen "läuft auf der Börse" und "läuft nicht".
   ===================================================================== */

/** Ein Katalogeintrag in der Form, die der Scanner und die Sammlung erwarten. */
function releaseToItem(release, barcode) {
  return {
    release_id: release.id,
    discogs_id: release.discogs_id,
    title: release.title,
    artist: release.artist,
    format: release.format,
    year: release.year,
    country: release.country,
    barcode: release.barcode || barcode || null,
    cover_url: release.cover_url,
  };
}

/** Katalogtreffer zu einem Barcode. Leer, wenn nichts da ist. */
async function fetchReleasesByBarcode(barcode) {
  if (!barcode) return [];
  const { data, error } = await sb
    .from("releases")
    .select("*")
    .eq("barcode", String(barcode));
  if (error) throw error;
  return data || [];
}

/** Katalogeinträge zu mehreren Discogs-IDs – eine Abfrage, nicht acht. */
async function fetchReleasesByDiscogsIds(ids) {
  const liste = [...new Set(ids.filter((v) => v !== null && v !== undefined))].map(String);
  if (liste.length === 0) return [];
  const { data, error } = await sb.from("releases").select("*").in("discogs_id", liste);
  if (error) throw error;
  return data || [];
}

/**
 * Eintrag anlegen oder ergänzen, gibt die Katalog-id zurück.
 *
 * Läuft über eine Datenbankfunktion statt über ein direktes insert: die
 * Tabelle ist für Nutzer schreibgeschützt, sonst könnte einer die
 * Stammdaten aller anderen überschreiben. Die Funktion füllt nur Lücken
 * und lässt vorhandene Werte stehen.
 *
 * Gibt null zurück, wenn es nicht klappt – ein fehlender Katalogeintrag
 * darf niemanden daran hindern, seine Platte zu speichern.
 */
async function upsertRelease(item) {
  if (!item || item.discogs_id === null || item.discogs_id === undefined) return null;
  try {
    const { data, error } = await sb.rpc("upsert_release", {
      daten: {
        discogs_id: item.discogs_id,
        title: item.title,
        artist: item.artist,
        format: item.format,
        year: item.year,
        country: item.country,
        barcode: item.barcode,
        cover_url: item.cover_url,
        label: item.label,
        catalog_no: item.catalog_no,
        genres: item.genres,
      },
    });
    if (error) return null;
    return data || null;
  } catch {
    return null;
  }
}
