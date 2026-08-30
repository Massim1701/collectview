/* =====================================================================
   i18n.js – Sprachgerüst für Plattenregal (DE/EN/IT/PL/ES).
   Deutsch bleibt die Quelle: fehlt ein Schlüssel in einer anderen
   Sprache, fällt t() automatisch auf Deutsch zurück, nie auf den
   rohen Schlüssel. Auswahl wird in localStorage gemerkt (pr_lang).

   Benutzung:
     - Statisches HTML: data-i18n="key" ersetzt textContent,
       data-i18n-placeholder="key" setzt placeholder, data-i18n-title
       setzt das title-Attribut.
     - Aus JS: t("key") liefert den Text in der aktuellen Sprache.
     - Nach dynamischem innerHTML mit data-i18n-Attributen einmal
       applyI18n(container) aufrufen.
   ===================================================================== */

const I18N = {
  de: {
    nav_home: "Home",
    nav_collection: "Sammlung",
    nav_search: "Suche",
    nav_account: "Konto",
    nav_scan_sr: "Tonträger scannen",

    common_save: "Speichern",
    common_cancel: "Abbrechen",
    common_back: "Zurück",
    common_loading: "Lädt …",
    common_error_title: "Da ist etwas schiefgelaufen",
    common_language: "Sprache",

    account_signed_in_as: "Angemeldet als",
    account_change_username: "Ändern",
    account_set_username: "Festlegen",
    account_logout: "Abmelden",

    collection_title: "Sammlung",
    collection_sub: "Deine Tonträger",
    collection_sort_title: "Titel",
    collection_sort_artist: "Interpret",
    collection_empty: "Noch nichts in der Sammlung.",

    wishlist_title: "Wunschliste",
    wishlist_empty: "Die Wunschliste ist leer.",

    detail_quantity: "Anzahl eigener Exemplare",
    detail_remove: "Entfernen",
    detail_remove_confirm: "Wirklich entfernen?",

    login_title: "Anmelden",
    login_email: "E-Mail",
    login_password: "Passwort",
    login_submit: "Anmelden",
    login_no_account: "Noch kein Konto?",
    login_create_account: "Registrieren",

    scanner_title: "Scannen",
    scanner_sub: "Barcode der Schallplatte oder CD erfassen",
    scanner_mode_barcode: "Barcode",
    scanner_mode_cover: "Cover-Foto",
    scanner_start_barcode: "Barcode-Scan starten",
    scanner_stop: "Scan stoppen",
    scanner_start_camera: "Kamera starten",
    scanner_stop_camera: "Kamera stoppen",
    scanner_take_photo: "Foto aufnehmen",
    scanner_recent: "Zuletzt gespeichert",
    scanner_view_collection: "Ganze Sammlung ansehen",

    marketplace_title: "Forum",
    marketplace_tab_all: "Alle Beiträge",
    marketplace_tab_mine: "Meine Beiträge",
    marketplace_new_post: "Neuer Beitrag",
    marketplace_offer: "Biete",
    marketplace_wanted: "Suche",
    marketplace_sold: "Verkauft",
    marketplace_found: "Gefunden",
    marketplace_contact: "Nachricht senden",
    marketplace_messages: "Nachrichten von Interessenten",
    marketplace_plus_required: "Nur für Plattenregal Plus",
    marketplace_translate: "Übersetzen",
    marketplace_original: "Original anzeigen",
    marketplace_translating: "Übersetze …",
  },

  en: {
    nav_home: "Home",
    nav_collection: "Collection",
    nav_search: "Search",
    nav_account: "Account",
    nav_scan_sr: "Scan a release",

    common_save: "Save",
    common_cancel: "Cancel",
    common_back: "Back",
    common_loading: "Loading …",
    common_error_title: "Something went wrong",
    common_language: "Language",

    account_signed_in_as: "Signed in as",
    account_change_username: "Change",
    account_set_username: "Set username",
    account_logout: "Log out",

    collection_title: "Collection",
    collection_sub: "Your records",
    collection_sort_title: "Title",
    collection_sort_artist: "Artist",
    collection_empty: "Nothing in your collection yet.",

    wishlist_title: "Wishlist",
    wishlist_empty: "Your wishlist is empty.",

    detail_quantity: "Copies you own",
    detail_remove: "Remove",
    detail_remove_confirm: "Really remove this?",

    login_title: "Sign in",
    login_email: "Email",
    login_password: "Password",
    login_submit: "Sign in",
    login_no_account: "No account yet?",
    login_create_account: "Sign up",

    scanner_title: "Scan",
    scanner_sub: "Scan the barcode of your record or CD",
    scanner_mode_barcode: "Barcode",
    scanner_mode_cover: "Cover photo",
    scanner_start_barcode: "Start barcode scan",
    scanner_stop: "Stop scan",
    scanner_start_camera: "Start camera",
    scanner_stop_camera: "Stop camera",
    scanner_take_photo: "Take photo",
    scanner_recent: "Recently saved",
    scanner_view_collection: "View whole collection",

    marketplace_title: "Forum",
    marketplace_tab_all: "All posts",
    marketplace_tab_mine: "My posts",
    marketplace_new_post: "New post",
    marketplace_offer: "Offering",
    marketplace_wanted: "Wanted",
    marketplace_sold: "Sold",
    marketplace_found: "Found",
    marketplace_contact: "Send message",
    marketplace_messages: "Messages from interested buyers",
    marketplace_plus_required: "Plattenregal Plus only",
    marketplace_translate: "Translate",
    marketplace_original: "Show original",
    marketplace_translating: "Translating …",
  },

  it: {
    nav_home: "Home",
    nav_collection: "Collezione",
    nav_search: "Cerca",
    nav_account: "Account",
    nav_scan_sr: "Scansiona un disco",

    common_save: "Salva",
    common_cancel: "Annulla",
    common_back: "Indietro",
    common_loading: "Caricamento …",
    common_error_title: "Qualcosa è andato storto",
    common_language: "Lingua",

    account_signed_in_as: "Accesso come",
    account_change_username: "Modifica",
    account_set_username: "Imposta",
    account_logout: "Esci",

    collection_title: "Collezione",
    collection_sub: "I tuoi dischi",
    collection_sort_title: "Titolo",
    collection_sort_artist: "Artista",
    collection_empty: "Ancora nulla nella collezione.",

    wishlist_title: "Lista dei desideri",
    wishlist_empty: "La lista dei desideri è vuota.",

    detail_quantity: "Copie possedute",
    detail_remove: "Rimuovi",
    detail_remove_confirm: "Rimuovere davvero?",

    login_title: "Accedi",
    login_email: "E-mail",
    login_password: "Password",
    login_submit: "Accedi",
    login_no_account: "Non hai un account?",
    login_create_account: "Registrati",

    scanner_title: "Scansiona",
    scanner_sub: "Scansiona il codice a barre del disco o CD",
    scanner_mode_barcode: "Codice a barre",
    scanner_mode_cover: "Foto copertina",
    scanner_start_barcode: "Avvia scansione",
    scanner_stop: "Ferma scansione",
    scanner_start_camera: "Avvia fotocamera",
    scanner_stop_camera: "Ferma fotocamera",
    scanner_take_photo: "Scatta foto",
    scanner_recent: "Salvati di recente",
    scanner_view_collection: "Vedi tutta la collezione",

    marketplace_title: "Forum",
    marketplace_tab_all: "Tutti gli annunci",
    marketplace_tab_mine: "I miei annunci",
    marketplace_new_post: "Nuovo annuncio",
    marketplace_offer: "Offro",
    marketplace_wanted: "Cerco",
    marketplace_sold: "Venduto",
    marketplace_found: "Trovato",
    marketplace_contact: "Invia messaggio",
    marketplace_messages: "Messaggi degli interessati",
    marketplace_plus_required: "Solo per Plattenregal Plus",
    marketplace_translate: "Traduci",
    marketplace_original: "Mostra originale",
    marketplace_translating: "Traduzione …",
  },

  pl: {
    nav_home: "Start",
    nav_collection: "Kolekcja",
    nav_search: "Szukaj",
    nav_account: "Konto",
    nav_scan_sr: "Zeskanuj płytę",

    common_save: "Zapisz",
    common_cancel: "Anuluj",
    common_back: "Wstecz",
    common_loading: "Ładowanie …",
    common_error_title: "Coś poszło nie tak",
    common_language: "Język",

    account_signed_in_as: "Zalogowano jako",
    account_change_username: "Zmień",
    account_set_username: "Ustaw",
    account_logout: "Wyloguj",

    collection_title: "Kolekcja",
    collection_sub: "Twoje płyty",
    collection_sort_title: "Tytuł",
    collection_sort_artist: "Wykonawca",
    collection_empty: "W kolekcji nic jeszcze nie ma.",

    wishlist_title: "Lista życzeń",
    wishlist_empty: "Lista życzeń jest pusta.",

    detail_quantity: "Liczba posiadanych egzemplarzy",
    detail_remove: "Usuń",
    detail_remove_confirm: "Na pewno usunąć?",

    login_title: "Zaloguj się",
    login_email: "E-mail",
    login_password: "Hasło",
    login_submit: "Zaloguj się",
    login_no_account: "Nie masz konta?",
    login_create_account: "Zarejestruj się",

    scanner_title: "Skanuj",
    scanner_sub: "Zeskanuj kod kreskowy płyty lub CD",
    scanner_mode_barcode: "Kod kreskowy",
    scanner_mode_cover: "Zdjęcie okładki",
    scanner_start_barcode: "Rozpocznij skanowanie",
    scanner_stop: "Zatrzymaj skanowanie",
    scanner_start_camera: "Uruchom kamerę",
    scanner_stop_camera: "Zatrzymaj kamerę",
    scanner_take_photo: "Zrób zdjęcie",
    scanner_recent: "Ostatnio zapisane",
    scanner_view_collection: "Zobacz całą kolekcję",

    marketplace_title: "Forum",
    marketplace_tab_all: "Wszystkie ogłoszenia",
    marketplace_tab_mine: "Moje ogłoszenia",
    marketplace_new_post: "Nowe ogłoszenie",
    marketplace_offer: "Oferuję",
    marketplace_wanted: "Szukam",
    marketplace_sold: "Sprzedane",
    marketplace_found: "Znalezione",
    marketplace_contact: "Wyślij wiadomość",
    marketplace_messages: "Wiadomości od zainteresowanych",
    marketplace_plus_required: "Tylko dla Plattenregal Plus",
    marketplace_translate: "Przetłumacz",
    marketplace_original: "Pokaż oryginał",
    marketplace_translating: "Tłumaczenie …",
  },

  es: {
    nav_home: "Inicio",
    nav_collection: "Colección",
    nav_search: "Buscar",
    nav_account: "Cuenta",
    nav_scan_sr: "Escanear un disco",

    common_save: "Guardar",
    common_cancel: "Cancelar",
    common_back: "Atrás",
    common_loading: "Cargando …",
    common_error_title: "Algo salió mal",
    common_language: "Idioma",

    account_signed_in_as: "Conectado como",
    account_change_username: "Cambiar",
    account_set_username: "Establecer",
    account_logout: "Cerrar sesión",

    collection_title: "Colección",
    collection_sub: "Tus discos",
    collection_sort_title: "Título",
    collection_sort_artist: "Artista",
    collection_empty: "Todavía no hay nada en la colección.",

    wishlist_title: "Lista de deseos",
    wishlist_empty: "La lista de deseos está vacía.",

    detail_quantity: "Copias que tienes",
    detail_remove: "Quitar",
    detail_remove_confirm: "¿Quitar de verdad?",

    login_title: "Iniciar sesión",
    login_email: "Correo electrónico",
    login_password: "Contraseña",
    login_submit: "Iniciar sesión",
    login_no_account: "¿Aún no tienes cuenta?",
    login_create_account: "Regístrate",

    scanner_title: "Escanear",
    scanner_sub: "Escanea el código de barras del disco o CD",
    scanner_mode_barcode: "Código de barras",
    scanner_mode_cover: "Foto de portada",
    scanner_start_barcode: "Iniciar escaneo",
    scanner_stop: "Detener escaneo",
    scanner_start_camera: "Iniciar cámara",
    scanner_stop_camera: "Detener cámara",
    scanner_take_photo: "Tomar foto",
    scanner_recent: "Guardado recientemente",
    scanner_view_collection: "Ver toda la colección",

    marketplace_title: "Foro",
    marketplace_tab_all: "Todas las publicaciones",
    marketplace_tab_mine: "Mis publicaciones",
    marketplace_new_post: "Nueva publicación",
    marketplace_offer: "Ofrezco",
    marketplace_wanted: "Busco",
    marketplace_sold: "Vendido",
    marketplace_found: "Encontrado",
    marketplace_contact: "Enviar mensaje",
    marketplace_messages: "Mensajes de interesados",
    marketplace_plus_required: "Solo para Plattenregal Plus",
    marketplace_translate: "Traducir",
    marketplace_original: "Mostrar original",
    marketplace_translating: "Traduciendo …",
  },
};

const I18N_LANGS = [
  ["de", "Deutsch"],
  ["en", "English"],
  ["it", "Italiano"],
  ["pl", "Polski"],
  ["es", "Español"],
];

function getLang() {
  const stored = localStorage.getItem("pr_lang");
  return I18N[stored] ? stored : "de";
}

function setLang(lang) {
  if (!I18N[lang]) return;
  localStorage.setItem("pr_lang", lang);
  document.documentElement.lang = lang;
  applyI18n(document);
}

/** Übersetzung für einen Schlüssel. Fällt auf Deutsch, dann auf den
    Schlüssel selbst zurück – so bleibt eine fehlende Übersetzung
    sichtbar statt die Seite kaputt zu machen. */
function t(key) {
  const lang = getLang();
  return I18N[lang]?.[key] ?? I18N.de[key] ?? key;
}

/** Statisches Markup mit data-i18n-* übersetzen. Für dynamisch erzeugtes
    HTML (Karten, Listen …) nach dem Einfügen erneut aufrufen. */
function applyI18n(root = document) {
  root.querySelectorAll?.("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll?.("[data-i18n-placeholder]").forEach((el) => {
    el.setAttribute("placeholder", t(el.dataset.i18nPlaceholder));
  });
  root.querySelectorAll?.("[data-i18n-title]").forEach((el) => {
    el.setAttribute("title", t(el.dataset.i18nTitle));
  });
}

/**
 * Freitext (Forum-Beiträge, Nachrichten) übersetzen – über MyMemory,
 * einen kostenlosen Übersetzungsdienst ohne API-Key. Läuft nur auf
 * Knopfdruck ("Übersetzen"), nie automatisch: Nutzerinhalte werden
 * nicht ungefragt verändert angezeigt.
 *
 * Die Quellsprache lässt sich ohne echte Erkennung nur schätzen –
 * Zielsprache Deutsch nimmt Englisch als Quelle an, sonst umgekehrt.
 * Für Beiträge in einer dritten Sprache ist das Ergebnis entsprechend
 * ungenauer, aber besser als gar keine Übersetzung.
 */
async function translateText(text, targetLang) {
  const source = targetLang === "de" ? "en" : "de";
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${source}|${targetLang}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Übersetzung fehlgeschlagen");
  const data = await res.json();
  const result = data?.responseData?.translatedText;
  if (!result) throw new Error("Übersetzung fehlgeschlagen");
  return result;
}

/** Übersetzen-Umschalter für einen Textblock: Klick übersetzt und
    zeigt das Ergebnis unter dem Original, erneuter Klick blendet es
    wieder aus. `getText` liest den aktuellen Originaltext aus (kein
    fester String, falls sich der Inhalt ändert). */
function wireTranslateToggle(button, targetEl, getText) {
  let translated = null;
  button.addEventListener("click", async () => {
    if (translated) {
      translated.remove();
      translated = null;
      button.textContent = t("marketplace_translate");
      return;
    }
    button.disabled = true;
    button.textContent = t("marketplace_translating");
    try {
      const result = await translateText(getText(), getLang());
      translated = document.createElement("div");
      translated.className = "translated-text";
      translated.style.cssText = "margin-top:6px;padding-top:6px;border-top:1px dashed var(--border);color:var(--text-muted);";
      translated.textContent = result;
      targetEl.appendChild(translated);
      button.textContent = t("marketplace_original");
    } catch (e) {
      button.textContent = t("marketplace_translate");
      alert(e.message);
    } finally {
      button.disabled = false;
    }
  });
}

/** Eigene, minimale Escape-Funktion: i18n.js lädt VOR ui.js (damit
    renderBottomNav & Co. beim ersten Aufruf schon t() nutzen können),
    kann sich also nicht auf das dortige escapeHtml verlassen. */
function i18nEscape(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]),
  );
}

/** Kleine Sprachauswahl (Select), z. B. neben der Konto-Zeile. Änderung
    lädt die Seite neu, damit auch dynamisch erzeugte Texte (Skripte wie
    collection.js, marketplace.js) neu mit der Sprache gerendert werden. */
function renderLangSwitcher(container) {
  if (!container) return;
  const current = getLang();
  container.innerHTML = `
    <select class="field lang-switcher" id="lang-switcher" aria-label="${i18nEscape(t("common_language"))}">
      ${I18N_LANGS.map(([code, label]) => `<option value="${code}"${code === current ? " selected" : ""}>${i18nEscape(label)}</option>`).join("")}
    </select>`;
  container.querySelector("#lang-switcher").addEventListener("change", (e) => setLang(e.target.value));
}

document.documentElement.lang = getLang();
document.addEventListener("DOMContentLoaded", () => applyI18n(document));
