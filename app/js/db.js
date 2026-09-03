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
  // releases(...) ist ein Embed über collection_items.release_id (siehe
  // db/releases.sql): liefert den gecachten Marktwert mit, ohne pro
  // Sammlung erneut bei Discogs anzufragen (der wohnt am Release, siehe
  // db/release-value.sql). item.releases ist null, wenn der Eintrag noch
  // keinem Katalog-Release zugeordnet ist (alte/manuelle Einträge).
  const { data, error } = await sb
    .from("collection_items")
    .select("*, releases(value_low, value_median, value_high, value_currency, value_fetched_at)")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Format-Buckets. Discogs liefert Strings wie "Vinyl, LP, Album" oder
 * "CD, Album, Reissue" – deshalb wird der Format-String durchsucht,
 * nicht exakt verglichen.
 */
/** Hat der Nutzer ein aktives CollectView-Plus-Abo? */
async function fetchIsSubscribed(userId) {
  const { data, error } = await sb.from("profiles").select("subscription_status").eq("id", userId).maybeSingle();
  if (error) throw error;
  return data?.subscription_status === "active";
}

/** Eigenes Profil (Benutzername, Rolle, Abo-Status, Akzentfarbe). */
async function fetchMyProfile(userId) {
  const { data, error } = await sb
    .from("profiles")
    .select("display_name, role, subscription_status, accent_color")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Persoenliche Akzentfarbe setzen/entfernen (color = null fuer "zurueck
 * zum Standard-Neongruen"). Nur mit aktivem Plus-Abo wirksam -- ein
 * Server-Trigger (db/accent-color.sql) laesst den Wert sonst unveraendert,
 * ohne Fehler zu werfen. Die erlaubten Farben stehen im DB-Constraint.
 */
async function setAccentColor(userId, color) {
  const { error } = await sb.from("profiles").update({ accent_color: color }).eq("id", userId);
  if (error) throw error;
}

/**
 * Benutzernamen setzen/ändern. Wirft einen lesbaren Fehler bei ungültigem
 * Format oder wenn der Name schon vergeben ist (Unique-Verletzung 23505).
 */
async function setDisplayName(userId, name) {
  const { error } = await sb.from("profiles").update({ display_name: name }).eq("id", userId);
  if (error) {
    if (error.code === "23505") throw new Error("Dieser Benutzername ist schon vergeben.");
    if (error.code === "23514") throw new Error("3–20 Zeichen: Buchstaben, Ziffern, _ oder -.");
    throw error;
  }
}

/** Benutzernamen mehrerer Nutzer auf einmal (für z. B. Nachrichtenlisten). Nie die E-Mail. */
async function fetchDisplayNames(userIds) {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (ids.length === 0) return {};
  const { data, error } = await sb.from("profiles_public").select("id, display_name").in("id", ids);
  if (error) throw error;
  const map = {};
  (data || []).forEach((row) => { map[row.id] = row.display_name; });
  return map;
}

/**
 * Plus-Abzeichen mehrerer Nutzer auf einmal (für Marktplatz-Beiträge):
 * ist aktiv abonniert + welche Akzentfarbe. Damit Plus-Verkäufer:innen in
 * den Beiträgen sofort erkennbar sind, nicht erst im eigenen Konto.
 */
async function fetchSellerBadges(userIds) {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (ids.length === 0) return {};
  const { data, error } = await sb
    .from("profiles_public")
    .select("id, accent_color, subscription_status")
    .in("id", ids);
  if (error) throw error;
  const map = {};
  (data || []).forEach((row) => {
    map[row.id] = { isPlus: row.subscription_status === "active", accentColor: row.accent_color || null };
  });
  return map;
}

/** Ist der Nutzer Admin? (role = 'admin') */
async function fetchIsAdmin(userId) {
  const { data, error } = await sb.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (error) throw error;
  return data?.role === "admin";
}

/** Ist der Nutzer Moderator oder Admin? (darf fremde Angebote entfernen) */
async function fetchIsModerator(userId) {
  const { data, error } = await sb.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (error) throw error;
  return data?.role === "admin" || data?.role === "moderator";
}

/** Nutzer per Benutzername finden (für Admin-Rollenvergabe). Nur der öffentliche View, keine E-Mail. */
async function findUserByUsername(name) {
  const { data, error } = await sb
    .from("profiles_public")
    .select("id, display_name")
    .ilike("display_name", name.trim())
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Alle Nutzer mit Admin-/Moderator-Rolle (nur für Admins sichtbar dank profiles_select_admin). */
async function fetchStaffList() {
  const { data, error } = await sb
    .from("profiles")
    .select("id, display_name, role")
    .neq("role", "user")
    .order("role");
  if (error) throw error;
  return data || [];
}

/**
 * Rolle setzen. Die DB erzwingt: nur Admins dürfen das (RLS), max. 2 Admins
 * und max. 3 Moderatoren (Trigger) – dessen Fehlermeldung kommt hier
 * unverändert durch (z. B. "Maximal 2 Admins erlaubt.").
 */
async function setUserRole(userId, role) {
  const { error } = await sb.from("profiles").update({ role }).eq("id", userId);
  if (error) throw new Error(error.message.replace(/^.*?:\s*/, ""));
}

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
