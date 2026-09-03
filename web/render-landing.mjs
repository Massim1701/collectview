#!/usr/bin/env node
// Leitet die bei Cloudflare (collectview-site, Workers-Assets) ausgespielte
// Startseite aus wireframes/landing.html ab.
//
// Warum das ein eigener Schritt ist: wireframes/landing.html benutzt relative
// Pfade (../app/..., ./styles.css, ./pricing.html), weil es zusammen mit
// app/ direkt im Browser läuft (python3 -m http.server, siehe CLAUDE.md).
// Bei Cloudflare liegt die Startseite als Workers-Asset unter "/" - dort
// braucht es absolute Pfade (/app/..., /wireframes/styles.css,
// /wireframes/pricing.html), sonst brechen CSS, Icons und Links.
//
// Nutzung:
//   node web/render-landing.mjs > web/collectview-site-index.html
// Danach die Datei manuell (Cloudflare hat keinen API-Token im Repo/Sandbox)
// als index.html in die Workers-Assets von collectview-site hochladen bzw.
// mit "wrangler deploy" aus dem lokalen Worker-Projekt neu ausspielen.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "..", "wireframes", "landing.html"), "utf8");

const out = src
  .replaceAll("../app/", "/app/")
  .replaceAll('href="./styles.css"', 'href="/wireframes/styles.css"')
  .replaceAll('href="./pricing.html"', 'href="/wireframes/pricing.html"')
  .replaceAll('src="./assets/', 'src="/wireframes/assets/')
  .replaceAll('poster="./assets/', 'poster="/wireframes/assets/')
  .replace(
    "<title>Landingpage – CollectView</title>",
    "<title>CollectView &middot; Scan. Erkannt. Geh&ouml;rt.</title>"
  );

process.stdout.write(out);
