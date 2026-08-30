/* =====================================================================
   marketplace.js – Käufer/Verkäufer-Marktplatz (marketplace_listings,
   marketplace_messages). Eigenständiges Modul, rührt db.js/ui.js/auth.js
   nicht an – nutzt nur deren globale Funktionen (sb, escapeHtml, coverClass).
   Tabellenspalten (Stand: angelegt via SQL-Editor):
   marketplace_listings: id, seller_id, collection_item_id, title, artist,
     format, year, price_cents, currency, description, cover_url, status,
     created_at
   marketplace_messages: id, listing_id, sender_id, recipient_id, body,
     created_at
   ===================================================================== */

/** Aktive Angebote aller Nutzer, neueste zuerst. */
async function fetchActiveListings() {
  const { data, error } = await sb
    .from("marketplace_listings")
    .select("*")
    .eq("status", "active")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

/** Alle eigenen Angebote (auch verkaufte/entfernte), neueste zuerst. */
async function fetchMyListings(userId) {
  const { data, error } = await sb
    .from("marketplace_listings")
    .select("*")
    .eq("seller_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

async function fetchListing(id) {
  const { data, error } = await sb.from("marketplace_listings").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

async function createListing(fields) {
  const { data, error } = await sb.from("marketplace_listings").insert(fields).select().single();
  if (error) throw error;
  return data;
}

async function setListingStatus(id, status) {
  const { error } = await sb.from("marketplace_listings").update({ status }).eq("id", id);
  if (error) throw error;
}

/** Nachrichten zu einem Angebot (RLS liefert nur Zeilen, an denen man beteiligt ist). */
async function fetchListingMessages(listingId) {
  const { data, error } = await sb
    .from("marketplace_messages")
    .select("*")
    .eq("listing_id", listingId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function sendListingMessage(listingId, recipientId, body) {
  const { data: auth } = await sb.auth.getUser();
  const { error } = await sb.from("marketplace_messages").insert({
    listing_id: listingId,
    sender_id: auth.user.id,
    recipient_id: recipientId,
    body,
  });
  if (error) throw error;
}

/** Alle Konversationen, an denen der Nutzer beteiligt ist, gruppiert nach Angebot. */
async function fetchMyConversations(userId) {
  const { data, error } = await sb
    .from("marketplace_messages")
    .select("*, marketplace_listings(id, title, seller_id, status)")
    .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

/** "24,90 €" aus 2490 + "EUR". */
function formatPrice(priceCents, currency = "EUR") {
  const amount = (priceCents || 0) / 100;
  try {
    return new Intl.NumberFormat("de-DE", { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

/** Listing-Kachel im .list-card-Stil (siehe ui.js listCardMarkup). */
function listingCardMarkup(listing, { href } = {}) {
  const target = href || `marketplace-listing.html?id=${encodeURIComponent(listing.id)}`;
  const priceBadge = listing.status === "sold" ? "Verkauft" : formatPrice(listing.price_cents, listing.currency);
  return `
    <a class="list-card" href="${target}">
      ${coverMarkup(listing, { size: 56 })}
      <div style="min-width:0;">
        <div class="list-card-title">${escapeHtml(listing.title)}</div>
        <div class="list-card-sub">${[listing.artist, listing.format].filter(Boolean).map(escapeHtml).join(" · ")}</div>
      </div>
      <div style="flex:0 0 auto; font-weight:800; color:${listing.status === "sold" ? "var(--text-muted)" : "var(--accent-text)"};">${escapeHtml(priceBadge)}</div>
    </a>`;
}
