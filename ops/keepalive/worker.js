// Taeglicher Weckruf fuer die CollectView-Datenbank (siehe wrangler.toml).
// Kein oeffentlicher HTTP-Endpunkt: nur der Cron-Trigger loest Abfragen aus.

const TABELLEN = ["releases", "profiles"];

async function weckruf(env) {
  const ergebnisse = [];
  for (const t of TABELLEN) {
    const url = `${env.SUPABASE_URL}/rest/v1/${t}?select=id&limit=1`;
    const r = await fetch(url, {
      headers: { apikey: env.SUPABASE_KEY, Authorization: `Bearer ${env.SUPABASE_KEY}` },
    });
    ergebnisse.push({ tabelle: t, status: r.status });
    if (r.status >= 500) throw new Error(`Supabase antwortet ${r.status} auf ${t}: Datenbank pausiert oder gestoert?`);
  }
  console.log("keepalive ok", JSON.stringify(ergebnisse));
  return ergebnisse;
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(weckruf(env));
  },
  async fetch() {
    return new Response("nicht gefunden", { status: 404 });
  },
};
