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
