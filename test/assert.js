/* =====================================================================
   Winziges Testgerüst – keine Abhängigkeiten, läuft direkt im Browser.
   Eine Testdatei ruft test(...) beliebig oft und am Ende runTests().
   Das Ergebnis landet base64-kodiert im <title>, damit der Runner es
   ohne HTML-Entity-Gefrickel wieder auslesen kann.
   ===================================================================== */

const __tests = [];

function test(name, fn) {
  __tests.push({ name, fn });
}

function assert(condition, message) {
  if (!condition) throw new Error(message || "Erwartung nicht erfüllt");
}

function assertEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${message || "Werte verschieden"} – erwartet ${e}, war ${a}`);
}

function assertIncludes(haystack, needle, message) {
  if (!String(haystack).includes(needle)) {
    throw new Error(`${message || "Text fehlt"} – "${needle}" nicht enthalten in "${haystack}"`);
  }
}

function tick(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runTests() {
  const results = [];
  for (const t of __tests) {
    try {
      await t.fn();
      results.push({ name: t.name, ok: true });
    } catch (e) {
      results.push({ name: t.name, ok: false, error: e.message });
    }
  }
  const json = JSON.stringify(results);
  document.title = "RESULTS:" + btoa(String.fromCharCode(...new TextEncoder().encode(json)));
}
