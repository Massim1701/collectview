# collectview-site (Cloudflare Worker)

Der Worker läuft nur bei Cloudflare (Quick Edit), nicht in diesem Repo
deploybar — kein API-Token/Wrangler-Login in dieser Sitzung verfügbar.
Diese Dateien sind der Arbeitsstand, damit jede Sitzung darauf aufbauen
kann, statt bei Null anzufangen.

- `collectview-site-worker.js` — Rekonstruktion des Worker-Quelltexts.
  Herkunft (verifiziert vs. rekonstruiert) steht im Dateikopf. `UPSTREAM`
  ist ein nicht verifizierter Platzhalter — vor jedem Deploy gegen den
  echten Wert prüfen.
- `render-landing.mjs` — leitet `collectview-site-index.html` aus
  `../wireframes/landing.html` ab (relative → absolute Pfade, Titel).
  `node web/render-landing.mjs > web/collectview-site-index.html`
- `collectview-site-index.html` — aktueller Ableitungsstand der Startseite
  (Stand 02.09.2026, mit korrigierten Footer-Links).

Deploy geht nur über `wrangler deploy` aus dem lokalen Worker-Projekt
(Versionshistorie zeigt bisherige Deploys als "Wrangler by welove80sde")
oder manuell über Cloudflare Quick Edit — beides braucht Zugänge, die
diese Sitzung nicht hat.
