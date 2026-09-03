/* =====================================================================
   csv-import.js – generischer CSV-Import für die Sammlung (import.html).

   Bewusst generisch statt Discogs-spezifisch: wer seine Sammlung schon
   irgendwo als Liste hat (Excel, eine andere App, Discogs-Export), kann
   die als CSV exportieren und hier einlesen. Kein Cover-Matching, keine
   Discogs-Anfrage – das kann jede:r danach einzeln per Scan nachholen.

   Format identisch zum bestehenden Export (collection.js, CSV_COLUMNS):
   Semikolon-getrennt, deutsche Spaltenüberschriften, BOM. Ein Komma-
   getrenntes CSV (Standard-Export vieler Programme) wird ebenfalls
   erkannt – das Trennzeichen wird an der Kopfzeile geraten, nicht fest
   verdrahtet.
   ===================================================================== */

/** Spaltenname (deutsch, wie im Export) -> collection_items-Feld. Mehrere
    Schreibweisen pro Spalte, damit auch abweichende Exporte durchgehen. */
const IMPORT_COLUMN_ALIASES = {
  title: ["titel", "title", "album", "name"],
  artist: ["interpret", "artist", "künstler", "kuenstler", "band"],
  format: ["format"],
  year: ["jahr", "year"],
  country: ["land", "country"],
  barcode: ["barcode", "ean", "upc"],
  quantity: ["anzahl", "quantity", "menge"],
  notes: ["notizen", "notes", "anmerkung", "anmerkungen"],
};

/** Eine Beispielzeile für die herunterladbare Vorlage. */
const IMPORT_TEMPLATE_ROW = {
  title: "A Broken Frame",
  artist: "Depeche Mode",
  format: "Vinyl, LP, Album",
  year: "1982",
  country: "UK",
  barcode: "",
  quantity: "1",
  notes: "Beispielzeile – einfach überschreiben oder löschen",
};

function csvImportField(value) {
  const s = value === null || value === undefined ? "" : String(value);
  const needsQuoting = s.indexOf(";") !== -1 || s.indexOf(",") !== -1 || s.indexOf('"') !== -1 || s.indexOf("\n") !== -1;
  return needsQuoting ? '"' + s.split('"').join('""') + '"' : s;
}

/** Lädt eine leere Vorlage (Kopfzeile + eine Beispielzeile) herunter. */
function downloadImportTemplate() {
  const headerKeys = Object.keys(IMPORT_COLUMN_ALIASES);
  const headerLabels = headerKeys.map((k) => IMPORT_COLUMN_ALIASES[k][0]);
  const zeile = headerKeys.map((k) => csvImportField(IMPORT_TEMPLATE_ROW[k]));
  const csv = [headerLabels.join(";"), zeile.join(";")].join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "collectview-import-vorlage.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * Minimaler CSV-Parser (Anführungszeichen, eingebettetes Trennzeichen/
 * Zeilenumbrüche in Anführungszeichen, "" als escapetes Anführungszeichen).
 * Erkennt selbst, ob ";" oder "," das Trennzeichen ist (an der Kopfzeile).
 * Gibt { header: string[], rows: string[][] } zurück.
 */
function parseCsv(text) {
  const clean = text.replace(/^﻿/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const firstLine = clean.slice(0, clean.indexOf("\n") !== -1 ? clean.indexOf("\n") : undefined);
  const semi = (firstLine.match(/;/g) || []).length;
  const comma = (firstLine.match(/,/g) || []).length;
  const delim = semi >= comma ? ";" : ",";

  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inQuotes) {
      if (c === '"') {
        if (clean[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') { inQuotes = true; continue; }
    if (c === delim) { row.push(field); field = ""; continue; }
    if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += c;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const nonEmpty = rows.filter((r) => r.some((f) => f.trim() !== ""));
  if (nonEmpty.length === 0) return { header: [], rows: [] };
  return { header: nonEmpty[0].map((h) => h.trim()), rows: nonEmpty.slice(1) };
}

/** Ordnet die (unbekannten) CSV-Spalten den collection_items-Feldern zu. */
function mapCsvColumns(header) {
  const map = {};
  header.forEach((h, i) => {
    const norm = h.trim().toLowerCase();
    for (const [field, aliases] of Object.entries(IMPORT_COLUMN_ALIASES)) {
      if (aliases.includes(norm)) { map[field] = i; break; }
    }
  });
  return map;
}

/** Baut aus einer Roh-Zeile + Spalten-Zuordnung ein Sammlungs-Objekt.
    Gibt null zurück, wenn kein Titel da ist (Pflichtfeld). */
function csvRowToItem(row, colMap) {
  const get = (field) => (colMap[field] != null ? (row[colMap[field]] || "").trim() : "");
  const title = get("title");
  if (!title) return null;

  const yearRaw = get("year");
  const year = yearRaw && /^\d{1,4}$/.test(yearRaw) ? parseInt(yearRaw, 10) : null;
  const quantityRaw = get("quantity");
  const quantity = quantityRaw && /^\d+$/.test(quantityRaw) ? parseInt(quantityRaw, 10) : 1;

  return {
    title,
    artist: get("artist") || null,
    format: get("format") || null,
    year,
    country: get("country") || null,
    barcode: get("barcode") || null,
    quantity: quantity > 0 ? quantity : 1,
    notes: get("notes") || null,
    discogs_id: null,
    cover_url: null,
  };
}
