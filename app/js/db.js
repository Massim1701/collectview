/* =====================================================================
   db.js – Lesezugriffe auf collection_items + Ableitungen
   Tabellenspalten (Stand: verifiziert gegen die Datenbank):
   id, user_id, discogs_id, title, artist, format, year, country,
   barcode, cover_url, created_at, notes
   ===================================================================== */

/** Ein einzelner Eintrag. Gibt null zurück, wenn es ihn nicht gibt
    (oder er einem anderen User gehört – das filtert bereits RLS). */
async function fetchItem(id) {
  const { data, error } = await sb.from("collection_items").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Löscht einen Eintrag. `.select()` liefert die tatsächlich gelöschten
 * Zeilen zurück – ohne passende RLS-Policy meldet Postgres keinen Fehler,
 * löscht aber auch nichts. Genau das fangen wir hier ab.
 */
async function deleteItem(id) {
  const { data, error } = await sb.from("collection_items").delete().eq("id", id).select("id");
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error(
      "Der Eintrag wurde nicht gelöscht. Vermutlich fehlt in Supabase eine DELETE-Policy " +
      "für collection_items (Row Level Security).",
    );
  }
}

/** Alle Einträge des angemeldeten Users, neueste zuerst. RLS filtert nach user_id. */
async function fetchCollection() {
  const { data, error } = await sb
    .from("collection_items")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Format-Buckets. Discogs liefert Strings wie "Vinyl, LP, Album" oder
 * "CD, Album, Reissue" – deshalb wird der Format-String durchsucht,
 * nicht exakt verglichen.
 */
const FORMAT_FILTERS = [
  { key: "all", label: "Alle", test: () => true },
  { key: "vinyl", label: "Vinyl", test: (f) => /vinyl|\bLP\b|\b\d{1,2}"\b/i.test(f) },
  { key: "cd", label: "CD", test: (f) => /\bCDr?\b/i.test(f) },
  { key: "video", label: "DVD & Blu-ray", test: (f) => /\bDVD\b|blu-?ray/i.test(f) },
  { key: "cassette", label: "Kassette", test: (f) => /cassette|kassette/i.test(f) },
];

function formatFilterByKey(key) {
  return FORMAT_FILTERS.find((f) => f.key === key) || FORMAT_FILTERS[0];
}

function matchesFormat(item, key) {
  return formatFilterByKey(key).test(item.format || "");
}

/**
 * Kennzahlen für das Home-Dashboard.
 * Hinweis: "Genres" aus den Wireframes ist derzeit nicht berechenbar –
 * die Tabelle hat keine genre-Spalte. Solange zeigen wir die Anzahl
 * unterschiedlicher Formate. (Migration: collection_items um `genre text`
 * erweitern und beim Scannen aus dem Discogs-Ergebnis mitschreiben.)
 */
function computeStats(items) {
  const artists = new Set();
  const formats = new Set();

  items.forEach((item) => {
    const artist = (item.artist || "").trim();
    if (artist) artists.add(artist.toLowerCase());

    (item.format || "")
      .split(",")
      .map((f) => f.trim())
      .filter(Boolean)
      .forEach((f) => formats.add(f.toLowerCase()));
  });

  return { total: items.length, artists: artists.size, formats: formats.size };
}

/** Zählt, wie viele Einträge je Format-Filter existieren (ohne "Alle"). */
function formatBreakdown(items) {
  return FORMAT_FILTERS.filter((f) => f.key !== "all")
    .map((f) => ({ key: f.key, label: f.label, count: items.filter((i) => f.test(i.format || "")).length }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count);
}

/** Freitextsuche über Interpret, Titel, Format, Jahr und Land. */
function searchItems(items, query) {
  const q = query.trim().toLowerCase();
  if (!q) return items;

  return items.filter((item) =>
    [item.artist, item.title, item.format, item.year, item.country]
      .map((v) => String(v || "").toLowerCase())
      .some((v) => v.includes(q)),
  );
}

const SORTERS = {
  newest: { label: "Zuletzt hinzugefügt", fn: (a, b) => new Date(b.created_at) - new Date(a.created_at) },
  artist: { label: "Interpret A–Z", fn: (a, b) => (a.artist || "").localeCompare(b.artist || "", "de") },
  title: { label: "Titel A–Z", fn: (a, b) => (a.title || "").localeCompare(b.title || "", "de") },
  year: { label: "Jahr (neueste)", fn: (a, b) => (b.year || 0) - (a.year || 0) },
};

function sortItems(items, key) {
  const sorter = SORTERS[key] || SORTERS.newest;
  return [...items].sort(sorter.fn);
}
