/* =====================================================================
   marketplace.js – Forum/Marktplatz für Abo-Nutzer (marketplace_listings,
   marketplace_messages). Eigenständiges Modul, rührt db.js/ui.js/auth.js
   nicht an – nutzt nur deren globale Funktionen (sb, escapeHtml, coverClass).
   Tabellenspalten (Stand: angelegt via SQL-Editor):
   marketplace_listings: id, seller_id, collection_item_id, title, artist,
     format, year, price_cents (optional), currency, description, cover_url,
     status, kind ('biete' | 'gesucht'), created_at
   marketplace_messages: id, listing_id, sender_id, recipient_id, body,
     created_at

   Nur für Nutzer mit aktivem Abo (profiles.subscription_status = 'active'):
   RLS erlaubt Ansehen fremder Angebote, Erstellen und Nachrichten nur dann.
   Handel läuft ausschließlich per Direktnachricht, nie öffentlich im Forum.
   ===================================================================== */

/** Hat der Nutzer ein aktives Abo? Bestimmt Zugriff auf das Forum. */
async function fetchIsSubscribed(userId) {
  const { data, error } = await sb.from("profiles").select("subscription_status").eq("id", userId).maybeSingle();
  if (error) throw error;
  return data?.subscription_status === "active";
}

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

/** Preis-/Status-Badge: Verkauft, Preis, oder "Gesucht" bei Nachfrage-Einträgen. */
function listingBadge(listing) {
  if (listing.status === "sold") return { text: "Verkauft", muted: true };
  if (listing.kind === "gesucht") {
    return { text: listing.price_cents ? `Gesucht · bis ${formatPrice(listing.price_cents, listing.currency)}` : "Gesucht", muted: false };
  }
  return { text: formatPrice(listing.price_cents, listing.currency), muted: false };
}

/** Listing-Kachel im .list-card-Stil (siehe ui.js listCardMarkup). */
function listingCardMarkup(listing, { href } = {}) {
  const target = href || `marketplace-listing.html?id=${encodeURIComponent(listing.id)}`;
  const badge = listingBadge(listing);
  return `
    <a class="list-card" href="${target}">
      ${coverMarkup(listing, { size: 56 })}
      <div style="min-width:0;">
        <div class="list-card-title">${escapeHtml(listing.title)}</div>
        <div class="list-card-sub">${[listing.artist, listing.format].filter(Boolean).map(escapeHtml).join(" · ")}</div>
      </div>
      <div style="flex:0 0 auto; font-weight:800; color:${badge.muted ? "var(--text-muted)" : "var(--accent-text)"};">${escapeHtml(badge.text)}</div>
    </a>`;
}
