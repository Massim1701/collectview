/* CollectView Plus: Jahresabo kaufen (Stripe) und den Status anzeigen. Nur Web, kein Tracking.
   Nutzt abo.js (stripeCheckoutStarten) und den Supabase-Client; die Zahlung bestätigt allein der Webhook. */
const sb = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

(() => {
  const el = (id) => document.getElementById(id);
  const hinweis = el("upgrade-note");
  const melde = (text, fehler) => { hinweis.textContent = text; hinweis.classList.toggle("fehler", !!fehler); };

  /** Echte Anmeldung; anonyme Gast-Sitzungen aus dem Scanner zählen nicht. */
  async function sitzung() {
    if (!sb) { melde("Verbindung zum Server nicht möglich. Bitte Seite neu laden.", true); return null; }
    const { data } = await sb.auth.getSession();
    const s = data.session;
    return s && !s.user?.is_anonymous ? s : null;
  }

  el("upgrade-btn").addEventListener("click", async (ev) => {
    const knopf = ev.currentTarget;
    if (!(await sitzung())) { location.href = "/app/login.html?next=../plus"; return; }
    knopf.disabled = true;
    melde("Weiterleitung zur Kasse …", false);
    try {
      await stripeCheckoutStarten("jaehrlich"); // leitet bei Erfolg direkt zu Stripe weiter
    } catch (e) {
      melde(e.message, true);
      knopf.disabled = false;
    }
  });

  /** Hat die Person schon Plus (Web oder früherer Store-Kauf, beides landet in profiles)? */
  async function pruefeStatus() {
    const s = await sitzung();
    if (!s) return false;
    const { data: p } = await sb.from("profiles").select("subscription_status, role, trial_ends_at").eq("id", s.user.id).maybeSingle();
    if (!p) return false;
    const voll = p.subscription_status === "active" || p.role === "admin" || p.role === "moderator";
    const test = !voll && p.trial_ends_at && new Date(p.trial_ends_at) > new Date();
    el("upgrade-cta").hidden = voll || !!test;
    el("already-plus").hidden = !voll;
    el("trial-active").hidden = !test;
    if (test) {
      const bis = new Date(p.trial_ends_at).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
      el("trial-active-label").textContent = `Testzeitraum läuft bis ${bis}`;
    }
    return voll;
  }
  pruefeStatus();

  /* Rückkehr von Stripe: der Webhook schaltet Plus im Hintergrund frei, das dauert ein paar Sekunden. */
  const ergebnis = new URLSearchParams(location.search).get("checkout");
  if (ergebnis === "erfolg") {
    melde("Zahlung erfolgreich. Dein Abo wird gerade aktiviert, das kann einen Moment dauern.", false);
    [4000, 10000, 20000].forEach((ms) => setTimeout(async () => {
      if (await pruefeStatus()) melde("", false);
    }, ms));
  } else if (ergebnis === "abgebrochen") {
    melde("Der Kauf wurde abgebrochen.", true);
  }
})();
