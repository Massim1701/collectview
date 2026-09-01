#!/usr/bin/env node
/* =====================================================================
   cover-nachtragen.mjs – fehlende Cover in der Sammlung nachholen.

   Warum es das braucht: bis zum 01.09.2026 lieferte die Discogs-Suche
   keine Bilder (Token fehlte serverseitig). Alles, was davor in die
   Sammlung kam, trägt cover_url = NULL – und niemand füllt das je nach,
   weil das Cover nur beim Hinzufügen mitgeschrieben wird. Die Einträge
   blieben dauerhaft grau, obwohl das Bild bei Discogs längst liegt.

   Dieselbe Lücke entsteht jedes Mal neu, wenn Discogs beim Hinzufügen
   gerade kein Bild hat. Deshalb ein wiederholbares Skript statt eines
   einmaligen UPDATE von Hand.

   Läuft über die Management-API (PAT aus supabase/.env), weil die CLI
   mit einem anderen Konto angemeldet ist – siehe OFFEN.md.

     node scripts/cover-nachtragen.mjs          # zeigt nur an
     node scripts/cover-nachtragen.mjs --schreiben
   ===================================================================== */

import { readFileSync } from "node:fs";

const PROJEKT = "mevmpihydpksruhmzzwr";
const schreiben = process.argv.includes("--schreiben");

const env = {};
for (const zeile of readFileSync(new URL("../supabase/.env", import.meta.url), "utf8").split(/\r?\n/)) {
  const treffer = /^([A-Z0-9_]+)=(.*)$/.exec(zeile);
  if (treffer) env[treffer[1]] = treffer[2].trim();
}

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJEKT}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`SQL fehlgeschlagen (${res.status}): ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/** Das Cover eines Discogs-Releases. Null, wenn es dort keins gibt. */
async function holeCover(discogsId) {
  const res = await fetch(`https://api.discogs.com/releases/${discogsId}`, {
    headers: {
      Authorization: `Discogs token=${env.DISCOGS_TOKEN}`,
      "User-Agent": "CollectView/1.0 +https://collectview.site",
    },
  });
  if (!res.ok) return { fehler: `Discogs antwortete mit ${res.status}` };

  const daten = await res.json();
  const bilder = daten.images ?? [];
  // Reihenfolge wie beim Hinzufügen: das grosse Bild, sonst der Daumen.
  const primaer = bilder.find((b) => b.type === "primary") ?? bilder[0];
  return { url: primaer?.uri || daten.thumb || null };
}

const offene = await sql(
  `select id, discogs_id, title, artist from public.collection_items
    where cover_url is null and discogs_id is not null
    order by created_at`,
);

if (offene.length === 0) {
  console.log("Nichts nachzutragen – alle Einträge mit Discogs-ID haben ein Cover.");
  process.exit(0);
}

console.log(`${offene.length} Eintrag/Einträge ohne Cover:\n`);
let gefunden = 0;

for (const eintrag of offene) {
  const { url, fehler } = await holeCover(eintrag.discogs_id);
  const name = `${eintrag.artist ?? "?"} – ${eintrag.title ?? "?"}`;

  if (fehler) { console.log(`  ✗ ${name}: ${fehler}`); continue; }
  if (!url) { console.log(`  – ${name}: Discogs hat dort kein Bild`); continue; }

  gefunden++;
  console.log(`  ✓ ${name}\n    ${url}`);

  if (schreiben) {
    // Nur füllen, nie überschreiben: das and-cover_url-is-null verhindert,
    // dass ein inzwischen gesetztes Bild wieder verlorengeht.
    await sql(
      `update public.collection_items
          set cover_url = '${url.replace(/'/g, "''")}'
        where id = '${eintrag.id}' and cover_url is null`,
    );
  }

  // Discogs erlaubt 60 Anfragen pro Minute – eine Sekunde Abstand reicht.
  await new Promise((f) => setTimeout(f, 1100));
}

console.log(
  schreiben
    ? `\n${gefunden} Cover geschrieben.`
    : `\n${gefunden} Cover gefunden. Zum Schreiben: node scripts/cover-nachtragen.mjs --schreiben`,
);
