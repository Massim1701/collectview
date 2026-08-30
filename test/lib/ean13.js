/* =====================================================================
   ean13.js – zeichnet einen gültigen EAN-13 auf ein Canvas.

   Nur für Tests. Damit lässt sich die Barcode-Erkennung headless
   prüfen, ohne Kamera und ohne Bilddatei im Repo: erzeugter Code rein,
   erkannter Code raus. Genau die Sorte Fehler, die sonst erst am
   Telefon auffällt.
   ===================================================================== */

const EAN13_L = ["0001101","0011001","0010011","0111101","0100011","0110001","0101111","0111011","0110111","0001011"];
const EAN13_G = ["0100111","0110011","0011011","0100001","0011101","0111001","0000101","0010001","0001001","0010111"];
const EAN13_R = ["1110010","1100110","1101100","1000010","1011100","1001110","1010000","1000100","1001000","1110100"];
// Welche der ersten sechs Ziffern L- und welche G-Kodierung bekommen,
// bestimmt die führende Ziffer – sie selbst wird nicht als Balken gedruckt.
const EAN13_PARITY = ["LLLLLL","LLGLGG","LLGGLG","LLGGGL","LGLLGG","LGGLLG","LGGGLL","LGLGLG","LGLGGL","LGGLGL"];

/** Prüfziffer nach EAN-13 (Gewichte 1 und 3 im Wechsel). */
function ean13CheckDigit(twelve) {
  const z = String(twelve).replace(/\D/g, "").slice(0, 12);
  let summe = 0;
  for (let i = 0; i < 12; i++) summe += Number(z[i]) * (i % 2 === 0 ? 1 : 3);
  return String((10 - (summe % 10)) % 10);
}

/** Vollständiger 13-stelliger Code aus 12 Ziffern. */
function ean13Complete(twelve) {
  const z = String(twelve).replace(/\D/g, "").slice(0, 12);
  return z + ean13CheckDigit(z);
}

/** Modulfolge (95 Zeichen aus 0/1) für einen 13-stelligen Code. */
function ean13Modules(code) {
  const z = String(code).replace(/\D/g, "");
  if (z.length !== 13) throw new Error("EAN-13 braucht 13 Ziffern, bekam " + z.length);
  const parity = EAN13_PARITY[Number(z[0])];

  let bits = "101";
  for (let i = 1; i <= 6; i++) {
    bits += (parity[i - 1] === "L" ? EAN13_L : EAN13_G)[Number(z[i])];
  }
  bits += "01010";
  for (let i = 7; i <= 12; i++) bits += EAN13_R[Number(z[i])];
  return bits + "101";
}

/**
 * Zeichnet den Code auf ein neues Canvas.
 * `modul` ist die Breite eines Moduls in Pixeln, `ruhe` die Ruhezone
 * links und rechts – ohne sie erkennt kein Leser etwas.
 */
function ean13Canvas(code, { modul = 3, hoehe = 160, ruhe = 12 } = {}) {
  const bits = ean13Modules(code);
  const canvas = document.createElement("canvas");
  canvas.width = (bits.length + ruhe * 2) * modul;
  canvas.height = hoehe;

  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#000";
  for (let i = 0; i < bits.length; i++) {
    if (bits[i] === "1") ctx.fillRect((ruhe + i) * modul, 0, modul, hoehe);
  }
  return canvas;
}
