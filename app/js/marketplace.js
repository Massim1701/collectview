/* =====================================================================
   marketplace.js – Forum/Marktplatz für Abo-Nutzer (marketplace_listings,
   marketplace_messages). Eigenständiges Modul, rührt db.js/ui.js/auth.js
   nicht an – nutzt nur deren globale Funktionen (sb, escapeHtml, coverClass).
   Tabellenspalten (Stand: angelegt via SQL-Editor):
   marketplace_listings: id, seller_id, collection_item_id, title, artist,
     format, year, price_cents (optional), currency, description, cover_url,
     status, kind ('biete' | 'gesucht'), created_at
   marketplace_messages: id, listing_id, sender_id, recipient_id, body,
     created_at, read_at (Posteingang: Umschlag-Symbol mit Zähler,
     siehe fetchUnreadMessageCount/markConversationRead, db/marketplace-inbox.sql)

   Nur für Nutzer mit aktivem Abo (profiles.subscription_status = 'active'):
   RLS erlaubt Ansehen fremder Angebote, Erstellen und Nachrichten nur dann.
   Handel läuft ausschließlich per Direktnachricht, nie öffentlich im Forum.
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

/** Anzahl ungelesener Nachrichten an den Nutzer (für das Umschlag-Symbol). */
async function fetchUnreadMessageCount(userId) {
  const { count, error } = await sb
    .from("marketplace_messages")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", userId)
    .is("read_at", null);
  if (error) throw error;
  return count || 0;
}

/** Markiert alle empfangenen Nachrichten zu einem Angebot als gelesen. */
async function markConversationRead(listingId, userId) {
  const { error } = await sb
    .from("marketplace_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("listing_id", listingId)
    .eq("recipient_id", userId)
    .is("read_at", null);
  if (error) throw error;
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
/**
 * Farbwert einer Plus-Akzentfarbe fürs Badge (nicht die des lesenden
 * Nutzers -- die des/der Verkäufer:in, unabhängig von <html data-accent>).
 * Fällt ohne Auswahl auf das feste Markengrün zurück, wie überall sonst.
 */
function plusBadgeColor(accentColor) {
  const farben = { grau: "#C7CCD1", gelb: "#FFD23F", rot: "#FF4D5E", gruen: "#34C759", orange: "#FF8A3D" };
  return farben[accentColor] || "#A3C9A3";
}

/**
 * Beitragskarte. `seller` (optional, aus fetchSellerBadges) macht
 * Plus-Verkäufer:innen sofort erkennbar: farbiger Rahmen in ihrer eigenen
 * Akzentfarbe plus ein kleines "Plus"-Abzeichen -- nicht erst im Profil.
 */
function listingDateLabel(listing) {
  return listing.created_at ? new Date(listing.created_at).toLocaleDateString("de-DE") : "";
}

/** Umrechnungszeile ("≈ 54,20 $ · 47,30 £"), synchron aus vorab geladenen Kursen. */
function listingFxLine(listing, rates) {
  if (!rates || !listing.price_cents) return "";
  const andere = MARKTPLATZ_WAEHRUNGEN.filter((c) => c !== (listing.currency || "EUR"));
  const teile = andere.map((c) => formatMoney(convertCents(listing.price_cents, listing.currency || "EUR", c, rates), c));
  return teile.join(" · ");
}

/**
 * Nachrichten-Icon direkt an der Karte (nicht erst nach dem Öffnen) – die
 * Empfänger:in ist immer klar: die Ersteller:in des Beitrags, nie
 * manuell auswählbar. Nur für aktive, fremde Beiträge gedacht; der
 * Aufrufer (listingCardMarkup) blendet es bei eigenen Beiträgen aus.
 */
function messageIconButtonMarkup(listing) {
  return `
    <button class="sale-icon-btn" type="button" data-action="mp-msg-open"
            data-id="${escapeHtml(listing.id)}" data-seller="${escapeHtml(listing.seller_id)}" data-title="${escapeHtml(listing.title)}"
            aria-label="Nachricht an Verkäufer:in von „${escapeHtml(listing.title)}“" title="Nachricht senden">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/><path d="M3 7l9 6 9-6"/></svg>
    </button>`;
}

/**
 * `showMessage`: Nachrichten-Icon zeigen (nur fremde, aktive Beiträge –
 * der Aufrufer entscheidet das anhand von seller_id === eigene user.id).
 * `rates`: vorab geladene Wechselkurse für die Umrechnungszeile, optional.
 */
function listingCardMarkup(listing, { href, seller, showMessage = false, rates } = {}) {
  const target = href || `marketplace-listing.html?id=${encodeURIComponent(listing.id)}`;
  const badge = listingBadge(listing);
  const isPlus = !!seller?.isPlus;
  const plusColor = plusBadgeColor(seller?.accentColor);
  const fxLine = listingFxLine(listing, rates);
  const dateLabel = listingDateLabel(listing);
  return `
    <a class="list-card${isPlus ? " list-card-plus" : ""}" href="${target}" ${isPlus ? `style="--plus-color:${plusColor};"` : ""}>
      ${coverMarkup(listing, { size: 56 })}
      <div style="min-width:0;">
        <div class="list-card-title">
          ${escapeHtml(listing.title)}
          ${isPlus ? `<span class="plus-chip" style="--plus-color:${plusColor};" title="CollectView Plus">Plus</span>` : ""}
        </div>
        <div class="list-card-sub">${[listing.artist, listing.format].filter(Boolean).map(escapeHtml).join(" · ")}</div>
        <div class="list-card-sub" style="font-size:11.5px; opacity:.8;">${escapeHtml(dateLabel)}${fxLine ? ` · <span style="font-weight:700;">≈ ${escapeHtml(fxLine)}</span>` : ""}</div>
      </div>
      <div style="flex:0 0 auto; display:flex; flex-direction:column; align-items:flex-end; gap:6px;">
        <div style="font-weight:800; color:${badge.muted ? "var(--text-muted)" : "var(--accent-text)"};">${escapeHtml(badge.text)}</div>
        ${showMessage ? messageIconButtonMarkup(listing) : ""}
      </div>
    </a>`;
}

/* ---------- Nachricht direkt aus der Liste heraus ---------- */

let mpMsgDialog = null;

function mpMsgDialogMarkup() {
  return `
    <h2 class="feedback-title">Nachricht senden</h2>
    <p class="feedback-lead" id="mp-msg-target"></p>
    <textarea id="mp-msg-text" class="field feedback-textarea" rows="4" placeholder="Deine Nachricht …"></textarea>
    <p class="err" id="mp-msg-error" role="alert"></p>
    <div class="row">
      <button class="btn-secondary" type="button" data-action="mp-msg-cancel">Abbrechen</button>
      <button class="btn-primary" type="button" data-action="mp-msg-send">Senden</button>
    </div>`;
}

function ensureMpMsgDialog() {
  if (mpMsgDialog) return mpMsgDialog;
  mpMsgDialog = document.createElement("dialog");
  mpMsgDialog.className = "feedback-dialog";
  mpMsgDialog.id = "mp-msg-dialog";
  mpMsgDialog.innerHTML = mpMsgDialogMarkup();
  document.body.appendChild(mpMsgDialog);

  mpMsgDialog.addEventListener("click", (e) => {
    const action = e.target.closest("[data-action]")?.dataset.action;
    if (action === "mp-msg-cancel") mpMsgDialog.close();
    if (action === "mp-msg-send") sendMpMsg();
  });
  return mpMsgDialog;
}

function openMpMsgDialog(listingId, sellerId, title) {
  const dialog = ensureMpMsgDialog();
  dialog.dataset.listingId = listingId;
  dialog.dataset.sellerId = sellerId;
  dialog.querySelector("#mp-msg-target").textContent = `An die Verkäufer:in von „${title}“`;
  dialog.querySelector("#mp-msg-text").value = "";
  dialog.querySelector("#mp-msg-error").textContent = "";
  dialog.showModal();
  dialog.querySelector("#mp-msg-text").focus();
}

async function sendMpMsg() {
  const dialog = mpMsgDialog;
  const text = dialog.querySelector("#mp-msg-text").value.trim();
  const errorEl = dialog.querySelector("#mp-msg-error");
  errorEl.textContent = "";
  if (!text) {
    errorEl.textContent = "Bitte eine Nachricht eingeben.";
    return;
  }
  const sendBtn = dialog.querySelector('[data-action="mp-msg-send"]');
  sendBtn.disabled = true;
  try {
    // recipientId kommt aus dem Beitrag selbst (seller_id) – nie eine
    // manuelle Auswahl, damit eine Nachricht nie an die falsche Person geht.
    await sendListingMessage(dialog.dataset.listingId, dialog.dataset.sellerId, text);
    dialog.close();
  } catch (e) {
    errorEl.textContent = e.message;
  } finally {
    sendBtn.disabled = false;
  }
}

/** Verdrahtet jedes [data-action="mp-msg-open"] innerhalb von `root`. */
function initMarketplaceMessages(root) {
  root.addEventListener("click", (e) => {
    const btn = e.target.closest('[data-action="mp-msg-open"]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    openMpMsgDialog(btn.dataset.id, btn.dataset.seller, btn.dataset.title);
  });
}
