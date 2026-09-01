/* =====================================================================
   wishlist.js – Wunschliste + Benachrichtigungen bei Marktplatz-Treffern
   Eigenständiges Modul, verändert keine geteilten Dateien.
   ===================================================================== */

async function fetchWishlist(userId) {
  const { data, error } = await sb
    .from("wishlist_items")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

async function addWishlistItem(fields) {
  const { data, error } = await sb.from("wishlist_items").insert(fields).select().single();
  if (error) throw error;
  return data;
}

async function removeWishlistItem(id) {
  const { error } = await sb.from("wishlist_items").delete().eq("id", id);
  if (error) throw error;
}

/* ---------- Discogs-Suche zum Befüllen der Wunschliste ----------
   Eigene, kleine Kopie von scanner.js' splitTitle/normalizeResult statt
   scanner.js hier mitzuladen: wishlist.html braucht weder Kamera noch
   Scan-Limit, nur die Textsuche. Gleiche Feldnamen wie dort, damit ein
   Discogs-Treffer von hier und vom Scanner identisch in wishlist_items
   landen (discogs_id, cover_url, barcode) – so erkennt scan-status.js
   später denselben Eintrag wieder, egal woher er kam. */
function wlSplitTitle(fullTitle) {
  const idx = fullTitle.indexOf(" - ");
  if (idx === -1) return ["", fullTitle];
  return [fullTitle.slice(0, idx), fullTitle.slice(idx + 3)];
}

function wlNormalizeResult(r) {
  const [artist, title] = wlSplitTitle(r.title || "");
  return {
    discogs_id: r.id,
    title,
    artist,
    format: (r.format || []).join(", "),
    year: r.year ? parseInt(r.year, 10) : null,
    cover_url: r.cover_image || r.thumb || null,
    barcode: null,
  };
}

/** Sucht bei Discogs; wirft bei Rate-Limit einen Fehler mit erkennbarer
    .rateLimited-Markierung, damit der Aufrufer eine passende Meldung zeigt. */
async function searchDiscogsForWishlist(text) {
  const res = await discogsSuche({ q: text });
  if (res.status === 429) {
    const err = new Error("Discogs bremst gerade – Limit von 25 Anfragen pro Minute erreicht. Kurz warten und nochmal versuchen.");
    err.rateLimited = true;
    throw err;
  }
  if (!res.ok) throw new Error(`Discogs antwortete mit ${res.status}`);
  const data = await res.json();
  return (data.results || []).slice(0, 8).map(wlNormalizeResult);
}

/** Karte für einen Discogs-Suchtreffer, mit "Hinzufügen" statt Entfernen-Button. */
function wishlistSearchResultMarkup(item, index) {
  return `
    <div class="list-card" data-index="${index}">
      ${coverMarkup(item, { size: 56 })}
      <div style="min-width:0;">
        <div class="list-card-title">${escapeHtml(item.title)}</div>
        <div class="list-card-sub">${itemSubtitle(item)}</div>
      </div>
      <button type="button" class="btn-primary small wishlist-search-add" data-index="${index}">Hinzufügen</button>
    </div>`;
}

async function fetchNotifications(userId) {
  const { data, error } = await sb
    .from("notifications")
    .select("*, marketplace_listings(id, title, status)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

async function markNotificationRead(id) {
  const { error } = await sb.from("notifications").update({ is_read: true }).eq("id", id);
  if (error) throw error;
}

async function countUnreadNotifications(userId) {
  const { count, error } = await sb
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_read", false);
  if (error) throw error;
  return count || 0;
}

/** Karte im .list-card-Stil für einen Wunschlisten-Eintrag, mit Entfernen-Button. */
function wishlistCardMarkup(item) {
  return `
    <div class="list-card" data-id="${escapeHtml(item.id)}">
      ${coverMarkup(item, { size: 56 })}
      <div style="min-width:0;">
        <div class="list-card-title">${escapeHtml(item.title)}</div>
        <div class="list-card-sub">${itemSubtitle(item)}</div>
      </div>
      <button type="button" class="wishlist-remove" data-id="${escapeHtml(item.id)}" aria-label="Von Wunschliste entfernen"
        style="background:none;border:0;color:var(--text-muted);cursor:pointer;padding:6px;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>`;
}

/** Karte für eine Benachrichtigung (Wunschlisten-Treffer). */
function notificationCardMarkup(n) {
  const listing = n.marketplace_listings;
  const href = listing && listing.status !== "removed" ? `marketplace-listing.html?id=${encodeURIComponent(listing.id)}` : null;
  const inner = `
    <div style="min-width:0;">
      <div class="list-card-title" style="font-size:14px;">${escapeHtml(n.message)}</div>
      <div class="list-card-sub">${new Date(n.created_at).toLocaleString("de-DE")}</div>
    </div>`;
  const badge = n.is_read ? "" : `<span style="width:9px;height:9px;border-radius:50%;background:var(--accent);flex:0 0 auto;"></span>`;
  const classAttr = `class="list-card"${n.is_read ? "" : ' style="background:var(--accent-soft);"'}`;
  return href
    ? `<a ${classAttr} href="${href}" data-notif-id="${escapeHtml(n.id)}">${inner}${badge}</a>`
    : `<div ${classAttr} data-notif-id="${escapeHtml(n.id)}">${inner}${badge}</div>`;
}
