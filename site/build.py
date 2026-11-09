#!/usr/bin/env python3
"""Erzeugt die statische CollectView-Webseite (Startseite + Unterseiten) in diesem Ordner.

Aufruf:  python3 site/build.py
Vorlage der Startseite: das freigegebene Mockup (Cover gezeichnet, keine echten Plattencover).
Die HTML-Dateien werden committet, damit die Seite ohne Build ausgeliefert werden kann.
Nur Standardbibliothek.
"""
import pathlib, re

HIER = pathlib.Path(__file__).resolve().parent
MOCK = pathlib.Path.home() / "Entwicklung" / "collectview-mockup"
JAHR = 2026

# ---------------------------------------------------------------- Stil (aus dem Mockup)
mock = (MOCK / "index.html").read_text(encoding="utf-8")
css = re.search(r"<style>(.*?)</style>", mock, re.S).group(1)
css = css.replace("url(fonts/", "url(fonts/")                      # liegt in assets/fonts/, CSS in assets/
css = re.sub(r"html\.shot[^\n]*\n", "", css)                       # Vorschau-Hilfen des Mockups
css = css.replace("/* Vorschau-Modus", "/* (entfernt) Vorschau-Modus")
# gezeichnete Cover im Regal und im Treffer (im Mockup durch echte Cover ersetzt)
css += """
.shelf img,.res .cover{image-rendering:pixelated}

/* ---- Unterseiten ---- */
.sub-head{padding:160px 0 56px}
.sub-head h1{font-weight:300;font-size:clamp(46px,8vw,128px);line-height:.92;letter-spacing:-.06em;text-wrap:balance}
.sub-head h1 b{font-weight:700}
.sub-head p{margin-top:32px;font-size:22px;line-height:1.45;max-width:34ch;color:var(--ink2)}
.rows{border-top:1px solid var(--ink)}
.row2{display:grid;grid-template-columns:1.2fr 1fr;gap:40px;padding:42px 0;border-bottom:1px solid var(--rule);align-items:center}
.row2 h2{font-weight:300;font-size:clamp(34px,4.6vw,76px);letter-spacing:-.055em;line-height:.95}
.row2 h2 b{font-weight:700}
.row2 p{font-size:19px;line-height:1.5;color:var(--ink2);max-width:40ch;margin:0}
.row2 .tag{display:inline-block;margin-top:14px;font-size:14px;color:var(--mut)}
.row2 .pill{margin-top:20px}
@media (max-width:900px){.row2{grid-template-columns:1fr;gap:16px}}
.pill.dunkel{background:var(--ink);color:#fff}
@media (hover:hover){.pill.dunkel:hover{background:var(--accent);color:var(--on-accent)}}
.pill[aria-disabled=true]{background:#d7d7d2;color:#66666c;cursor:not-allowed;pointer-events:none}
.prose{max-width:760px;padding-bottom:40px}
.prose h2{font-weight:600;font-size:28px;letter-spacing:-.03em;line-height:1.1;margin:52px 0 14px}
.prose p{font-size:19px;line-height:1.6;color:var(--ink2);margin-bottom:14px}
.prose a{color:var(--link);text-underline-offset:3px}
.prose .stand{font-size:15px;color:var(--mut)}
.prose address{font-style:normal;font-size:19px;line-height:1.6;color:var(--ink2)}
.cf{display:flex;flex-direction:column;gap:20px;max-width:560px;margin-top:20px}
.cf label{display:flex;flex-direction:column;gap:6px;font-size:13px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--mut)}
.cf input,.cf textarea{background:transparent;border:0;border-bottom:1px solid var(--ink);padding:8px 0;font:400 17px/1.4 'Bricolage Grotesque',system-ui,sans-serif;color:var(--ink);border-radius:0}
.cf input:focus-visible,.cf textarea:focus-visible{outline:0;border-bottom:2px solid var(--link)}
.cf textarea{min-height:110px;resize:vertical}
.cf .pill{align-self:flex-start;background:var(--ink);color:#fff}
.honey{position:absolute;left:-9999px}
.sub-end{margin-top:110px}
[hidden]{display:none!important}
.two .preis b{font-weight:700;color:var(--ink);font-size:22px;letter-spacing:-.02em}
.hinweis{font-size:15px;line-height:1.5;color:var(--mut);margin-top:14px;max-width:46ch}
.hinweis.fehler{color:#a82e1c}
.status{font-size:19px;line-height:1.5;color:var(--ink);margin-top:26px;max-width:40ch}
.pill:disabled{opacity:.55;cursor:wait}
"""

# ---------------------------------------------------------------- Bausteine
NAV = [("Funktionen", "index.html#funktionen", ""), ("Die App", "download.html", "opt"), ("Plus", "plus.html", ""),
       ("Fragen", "index.html#fragen", "opt"), ("Anmelden", "/app/login.html", "")]

def kopf(hell):
    links = "\n      ".join(f'<a href="{h}"{(" class=%r" % c).replace(chr(39), chr(34)) if c else ""}>{t}</a>' for t, h, c in NAV)
    return f"""<a class="skip" href="#inhalt">Zum Inhalt springen</a>
<header class="site{' hell' if hell else ' solid'}" id="site-header">
  <nav aria-label="Hauptnavigation">
    <a class="brand" href="index.html">CollectView</a>
    <div>
      {links}
    </div>
  </nav>
</header>"""

FUSS = f"""<footer class="fuss">
  <span>&copy; {JAHR} Driftware &middot; CollectView</span>
  <span><a href="impressum.html">Impressum</a><a href="datenschutz.html">Datenschutz</a><a href="support.html">Support</a></span>
</footer>"""

def seite(titel, beschreibung, inhalt, hell=False, extra_klasse="", skripte=""):
    return f"""<!doctype html>
<html lang="de" data-farbe="minze">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{titel}</title>
<meta name="description" content="{beschreibung}">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='9' fill='%2310C99B'/%3E%3C/svg%3E">
<link rel="stylesheet" href="assets/site.css">
<link rel="stylesheet" href="assets/mobil.css">
</head>
<body class="{extra_klasse}">
{kopf(hell)}
<main id="inhalt">
{inhalt}
</main>
{skripte}<script src="assets/site.js"></script>
</body>
</html>
"""

def unterseite(titel, kicker, ueberschrift_html, intro, inhalt, beschreibung, skripte=""):
    kopfbereich = f"""<section class="sub-head">
  <div class="wrap">
    <div class="lead">{kicker}</div>
    <h1>{ueberschrift_html}</h1>
    {f'<p>{intro}</p>' if intro else ''}
  </div>
</section>"""
    return seite(f"{titel} · CollectView", beschreibung, kopfbereich + "\n" + inhalt + f"\n<div class=\"wrap\">{FUSS}</div>", skripte=skripte)

# ---------------------------------------------------------------- Startseite aus dem Mockup
v8 = (MOCK / "index-mosaik8.html").read_text(encoding="utf-8")   # Telefone mit 8x8-Mosaik-Covern
haupt = re.search(r"<main>(.*)</main>", v8, re.S).group(1)
haupt = haupt.replace("img/ki/foto-", "assets/img/foto-").replace("img/covers-mosaik-8/", "assets/img/cover/")
haupt = haupt.replace('<section class="stage hell" id="stage">', '<section class="stage hell" id="stage">')
# Verweise auf echte Unterseiten
haupt = haupt.replace('<a class="pill" href="#app">App kostenlos laden', '<a class="pill" href="download.html">App kostenlos laden')
haupt = haupt.replace('<a class="pill" href="#plus">Plus ansehen', '<a class="pill" href="plus.html">Plus ansehen')
haupt = haupt.replace('<a class="pill" href="#">Plus entdecken', '<a class="pill" href="plus.html">Plus entdecken')
# Hinweis „Mockup“ und Platzhalter-Texte raus
haupt = re.sub(r'\s*<p class="rv" style="margin-top:14px[^"]*">Vorschau:.*?</p>', "", haupt, flags=re.S)
haupt = re.sub(r'<footer>.*?</footer>', FUSS.replace('class="fuss"', ''), haupt, flags=re.S)
haupt = haupt.replace("Preis folgt · jährlich kündbar", "Preise siehst du vor dem Abschluss")
index_html = seite("CollectView – Platten erkennen und sammeln",
                   "Barcode scannen oder Cover fotografieren: CollectView erkennt deine Schallplatten und CDs, zeigt Pressung, Jahr und Marktwert und baut daraus deine Sammlung.",
                   haupt, hell=True, extra_klasse="start")

# ---------------------------------------------------------------- Die App (Download)
def zeile(h2, text, tag, knopf):
    return f'<div class="row2 rv"><h2>{h2}</h2><div><p>{text}</p>{tag}{knopf}</div></div>'

app_inhalt = f"""<section style="padding-top:0">
  <div class="wrap">
    <div class="rows">
      {zeile("iPhone <b>und iPad</b>", "Die kostenlose CollectView-App für iOS. Scannen, erkennen, weitermachen, ohne Konto.",
             '<span class="tag">Version 1.0 · iPhone und iPad · App Store</span><br>', '<a class="pill dunkel" href="https://apps.apple.com/de/app/collectview/id6807394925" rel="noopener">Im App Store laden <span aria-hidden="true">→</span></a>')}
      {zeile("<b>Android</b>", "Die kostenlose CollectView-App für Android, direkt als APK. Beim Installieren fragt Android einmal nach der Erlaubnis für unbekannte Quellen. Prüfsumme (SHA-256): <span style=\"word-break:break-all;font-size:13px\">aee24d9fa34492c762cacd076c7d964a84eb49cd1fcdbecd8b0528849039fe9b</span>",
             '<span class="tag">Version 1.1 · 37,8 MB · APK · ab Android 8</span><br>', '<a class="pill dunkel" href="https://driftware.online/dl/CollectView-1.1.apk" download>APK laden <span aria-hidden="true">↓</span></a>')}
      {zeile("Im <b>Browser</b>", "Auch ohne App: Scannen und Marktwert ansehen geht direkt im Browser, mit Konto auch Sammlung und Marktplatz.",
             '', '<a class="pill dunkel" href="/app/login.html">Im Browser öffnen <span aria-hidden="true">→</span></a>')}
    </div>
  </div>
</section>
<section>
  <div class="wrap">
    <div class="lead rv">Was die App kann</div>
    <div class="list">
      <div class="item rv"><h2>Barcode <b>scannen</b></h2><p>Kamera auf den Strichcode, und die Ausgabe ist erkannt.</p></div>
      <div class="item rv"><h2>Cover <b>erkennen</b></h2><p>Kein Barcode? Das Cover-Foto genügt.</p></div>
      <div class="item rv"><h2>Marktwert <b>kennen</b></h2><p>Jahr, Format, Land und Preise laut Discogs.</p></div>
    </div>
  </div>
</section>"""
app_html = unterseite("Die App", "Download", "Die App. <b>Kostenlos.</b>",
                      "Scannen, prüfen, weitermachen. Dafür brauchst du kein Konto.", app_inhalt,
                      "Die kostenlose CollectView-App für iPhone, iPad und Android.")

# ---------------------------------------------------------------- Plus
plus_inhalt = """<section style="padding-top:0">
  <div class="wrap">
    <div class="two rv">
      <div>
        <h2>Scannen ist <b>frei.</b></h2>
        <ul>
          <li>Barcode und Cover-Foto</li>
          <li>Marktwert und Streaming-Link</li>
          <li>Kein Konto nötig</li>
        </ul>
        <a class="pill dunkel" href="download.html">Zur App <span aria-hidden="true">→</span></a>
      </div>
      <div>
        <h2>Sammeln ist <b>Plus.</b></h2>
        <ul>
          <li>Eigene Sammlung, durchsuchbar und unbegrenzt</li>
          <li>Wunschliste</li>
          <li>Marktplatz: anbieten und schreiben</li>
          <li>Kennzahlen und CSV-Import</li>
        </ul>
        <p class="preis"><b>24,90 € pro Jahr</b> · entspricht 2,08 € im Monat · jährlich kündbar · direkt hier bezahlt</p>
        <div id="upgrade-cta"><button class="pill dunkel" type="button" id="upgrade-btn">Jetzt Plus abschließen <span aria-hidden="true">→</span></button></div>
        <div id="already-plus" hidden><p class="status">Du hast CollectView Plus. Es gilt für deinen Account überall.</p></div>
        <div id="trial-active" hidden><p class="status" id="trial-active-label">Testzeitraum läuft</p><p class="hinweis">Danach brauchst du CollectView Plus, um weiter zu speichern und den Marktplatz zu nutzen.</p></div>
        <p class="hinweis" id="upgrade-note" role="status" aria-live="polite"></p>
      </div>
    </div>
  </div>
</section>
<section>
  <div class="wrap">
    <div class="lead rv">Gut zu wissen</div>
    <div class="faq rv">
      <details open><summary>Wo schließe ich Plus ab?</summary><p>Auf der Webseite, nach der Anmeldung. Die Bezahlung läuft sicher über Stripe, direkt hier, ohne App-Umweg.</p></details>
      <details><summary>Gilt Plus auch in der App?</summary><p>Die kostenlose App ist ein Scanner. Sammlung, Wunschliste und Marktplatz nutzt du im Browser mit deinem Konto.</p></details>
      <details><summary>Wie lange läuft Plus?</summary><p>Plus läuft ein Jahr und ist jährlich kündbar. Der Preis beträgt 24,90 € pro Jahr.</p></details>
    </div>
  </div>
</section>"""
plus_html = unterseite("Plus", "CollectView Plus", "Alles für deine <b>Sammlung.</b>", "Scannen bleibt kostenlos. Plus schaltet Sammlung, Wunschliste und Marktplatz frei.",
                       plus_inhalt, "CollectView Plus: Sammlung, Wunschliste und Marktplatz für deine Schallplatten. 24,90 € pro Jahr.",
                       skripte='<script src="/app/vendor/supabase.js"></script>\n<script src="/app/config.js"></script>\n<script src="/app/js/abo.js"></script>\n<script src="assets/plus.js"></script>\n')

# ---------------------------------------------------------------- Support
KONTAKT = "info@driftware.online"
support_inhalt = f"""<section style="padding-top:0">
  <div class="wrap">
    <div class="prose rv">
      <h2>Schreib uns</h2>
      <p>Fragen oder Probleme mit CollectView? Schreib uns an <a href="mailto:{KONTAKT}">{KONTAKT}</a>. Wir antworten so schnell wie möglich.</p>
      <h2>Häufige Themen</h2>
      <p>Abo-Fragen, Scan-Erkennung, Datenexport &mdash; melde dich einfach per E-Mail.</p>
    </div>
  </div>
</section>"""
support_html = unterseite("Support", "Hilfe", "Wie können wir <b>helfen?</b>", "", support_inhalt,
                          "Support für CollectView: Fragen zu Abo, Scan-Erkennung und Datenexport.")

# ---------------------------------------------------------------- Datenschutz (Text wörtlich aus der bisherigen Seite)
datenschutz_inhalt = f"""<section style="padding-top:0">
  <div class="wrap">
    <div class="prose">
      <p class="stand">Stand: 27. Oktober 2026</p>
      <h2>Verantwortlicher</h2>
      <p>Driftware, Nohlstr. 215, 46045 Oberhausen, Deutschland &middot; Kontakt: <a href="mailto:{KONTAKT}">{KONTAKT}</a></p>
      <h2>Konto &amp; Anmeldung</h2>
      <p>Die CollectView-App kann ohne Konto genutzt werden. Dabei legt sie im Hintergrund ein anonymes Gastkonto an: eine technische Kennung ohne Name und ohne E-Mail-Adresse. Sie dient dazu, die Nutzung technisch zuzuordnen und Missbrauch zu verhindern.</p>
      <p>Ein Konto mit E-Mail-Adresse und Passwort legst du auf collectview.site an. In der App kannst du dich damit anmelden. Anmeldung und Konten verwalten wir mit Supabase (Datenbank und Authentifizierung, Region EU/Frankfurt). Passwörter werden dort verschlüsselt gespeichert.</p>
      <h2>Scannen &amp; Suche</h2>
      <p>Den Barcode einer Platte oder CD liest die App auf deinem Gerät, dabei verlässt kein Bild das Gerät. Für die Suche nach der passenden Veröffentlichung, für Cover, Marktwerte und Hörlinks wird der Barcode oder dein Suchbegriff über unseren Server an die Discogs-Datenbank weitergeleitet.</p>
      <h2>Cover-Scan</h2>
      <p>Wenn du ein Cover fotografierst, wird dieses Foto zur Erkennung über unseren Server an Google (Gemini) übermittelt. Das Foto wird nur für die Erkennung verwendet und nicht dauerhaft bei uns gespeichert. Das passiert nur, wenn du den Cover-Modus bewusst nutzt.</p>
      <h2>Scan-Verlauf &amp; Zähler</h2>
      <p>Den Verlauf deiner letzten Scans speichert die App nur lokal auf deinem Gerät. Auf dem Server wird pro Konto lediglich gezählt, dass ein Scan stattgefunden hat (Missbrauchsschutz), ohne den Inhalt deiner Suche zu speichern.</p>
      <h2>Abo &amp; Zahlung</h2>
      <p>Die App ist kostenlos und enthält keine Käufe. CollectView Plus (Sammlung, Wunschliste, Marktplatz) ist ein Abo, das du ausschließlich auf der Webseite abschließt. Die Zahlung wickelt Stripe Payments Europe, Ltd. ab. Deine Zahlungsdaten gibst du direkt bei Stripe ein, wir sehen und speichern sie nicht. Von Stripe erhalten wir nur den Status deines Abos (aktiv oder beendet) und die Zuordnung zu deinem Konto. Rechtsgrundlage ist die Vertragserfüllung (Art. 6 Abs. 1 lit. b DSGVO). Du kannst das Abo jederzeit zum Ende der Laufzeit kündigen.</p>
      <h2>Eingesetzte Dienstleister</h2>
      <p>Supabase (Datenbank und Anmeldung), Cloudflare (Auslieferung der Webseite), Stripe (Zahlung im Web), Google (Bilderkennung beim Cover-Foto) und Discogs (Katalogdaten und Marktwerte). Mit den Dienstleistern bestehen, soweit erforderlich, Verträge zur Auftragsverarbeitung.</p>
      <h2>Keine Werbung, kein Tracking</h2>
      <p>CollectView zeigt keine Werbung und verwendet keine Tracking- oder Analyse-Dienste zu Werbezwecken. Die App verwendet keine Werbe-Kennung und gibt keine Daten an Datenhändler weiter.</p>
      <h2>Speicherdauer &amp; Löschung</h2>
      <p>Wir speichern deine Kontodaten, solange dein Konto besteht. Du kannst jederzeit die Löschung deines Kontos und deiner Daten verlangen, schreib uns einfach an <a href="mailto:{KONTAKT}">{KONTAKT}</a>.</p>
      <h2>Deine Rechte</h2>
      <p>Du kannst jederzeit Auskunft, Berichtigung, Löschung oder Einschränkung der Verarbeitung deiner Daten sowie Datenübertragbarkeit verlangen und der Verarbeitung widersprechen. Schreib uns dazu an <a href="mailto:{KONTAKT}">{KONTAKT}</a>. Außerdem hast du das Recht, dich bei einer Datenschutz-Aufsichtsbehörde zu beschweren.</p>
    </div>
  </div>
</section>"""
datenschutz_html = unterseite("Datenschutz", "Rechtliches", "Datenschutz&shy;<b>erklärung</b>", "", datenschutz_inhalt,
                              "Datenschutzerklärung von CollectView.")

# ---------------------------------------------------------------- Impressum (Angaben wie auf driftware.online)
impressum_inhalt = f"""<section style="padding-top:0">
  <div class="wrap">
    <div class="prose">
      <h2>Angaben gemäß § 5 DDG</h2>
      <address>Driftware<br>Nohlstr. 215<br>46045 Oberhausen<br>Deutschland</address>
      <h2>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h2>
      <p>Driftware, Anschrift wie oben</p>
      <h2>Kontakt</h2>
      <p>E-Mail: <a href="mailto:{KONTAKT}">{KONTAKT}</a><br>Oder über das Kontaktformular unten.</p>
      <h2>Kontaktformular</h2>
      <form class="cf" method="POST" action="https://formsubmit.co/{KONTAKT}">
        <input type="hidden" name="_subject" value="CollectView &mdash; neue Kontaktanfrage">
        <input type="hidden" name="_template" value="table">
        <input type="hidden" name="_next" value="https://collectview.site/impressum">
        <input type="text" name="_honey" class="honey" tabindex="-1" autocomplete="off" aria-hidden="true">
        <label>Name<input type="text" name="name" required autocomplete="name"></label>
        <label>Deine E-Mail-Adresse<input type="email" name="email" required autocomplete="email"></label>
        <label>Nachricht<textarea name="message" required></textarea></label>
        <button class="pill" type="submit">Senden</button>
      </form>
    </div>
  </div>
</section>"""
impressum_html = unterseite("Impressum", "Rechtliches", "<b>Impressum</b>", "", impressum_inhalt,
                            "Impressum von CollectView.")

# ---------------------------------------------------------------- Skript
js = """/* CollectView Webseite: Kopfzeile, Einblenden. Kein Tracking. */
(() => {
  document.documentElement.classList.add("js");
  const header = document.getElementById("site-header");
  const stage = document.getElementById("stage");
  const media = document.querySelector(".stage-media");
  const reduziert = matchMedia("(prefers-reduced-motion:reduce)").matches;
  const onScroll = () => {
    if (stage) {
      const fest = scrollY > stage.offsetHeight - 80;
      header.classList.toggle("solid", fest);
      header.classList.toggle("hell", !fest);
      if (media && !reduziert) media.style.transform = `translateY(${scrollY * 0.12}px)`;
    }
  };
  onScroll();
  addEventListener("scroll", onScroll, { passive: true });
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
  }), { threshold: 0.12 });
  document.querySelectorAll(".rv").forEach((el) => io.observe(el));
})();
"""

# ---------------------------------------------------------------- schreiben
css += """
.fuss{display:flex;justify-content:space-between;align-items:center;gap:24px;flex-wrap:wrap;padding:90px 0 28px;font-size:14px;color:var(--mut)}
.fuss a{display:inline-flex;align-items:center;min-height:44px;padding:0 10px;text-decoration:none;color:inherit}
.fuss span:last-child{display:flex;gap:2px;margin-right:-10px}
@media (hover:hover){.fuss a:hover{color:var(--ink);text-decoration:underline}}
.end .fuss{color:var(--on-accent)}
.end .fuss a:hover{color:var(--on-accent)}
"""
(HIER / "assets").mkdir(exist_ok=True)
(HIER / "assets" / "site.css").write_text(css.strip() + "\n", encoding="utf-8")
(HIER / "assets" / "site.js").write_text(js, encoding="utf-8")
# ---------------------------------------------------------------- Suchmaschinen-Kopfdaten (idempotent)
import html as _html, json as _json
BASIS_URL = "https://collectview.site"
APPSTORE_ID = "6807394925"
OG_BILD = BASIS_URL + "/assets/og-bild.png"
APP_LD = {"@type": "MobileApplication", "name": "CollectView", "url": BASIS_URL + "/",
          "description": "Schallplatten und CDs per Barcode oder Cover-Foto erkennen, Marktwert laut Discogs sehen und die Sammlung verwalten. Kostenlos und ohne Anmeldung nutzbar, ein Konto ist optional.",
          "applicationCategory": "LifestyleApplication", "operatingSystem": "iOS, Android", "inLanguage": "de",
          "isAccessibleForFree": True, "offers": {"@type": "Offer", "price": "0", "priceCurrency": "EUR"},
          "downloadUrl": "https://apps.apple.com/de/app/collectview/id" + APPSTORE_ID,
          "publisher": {"@type": "Organization", "name": "Driftware", "url": "https://driftware.online/"}}
def seo_block(name, t):
    e = _html.escape
    titel = re.search(r"<title>(.*?)</title>", t, re.S).group(1)
    beschr = re.search(r'<meta name="description" content="([^"]*)"', t).group(1)
    url = BASIS_URL + ("/" if name == "index" else "/" + name)
    z = ['<!-- seo -->',
         '<link rel="preload" href="assets/fonts/BricolageGrotesque-latin.woff2" as="font" type="font/woff2" crossorigin>',
         f'<link rel="canonical" href="{url}">',
         '<meta property="og:type" content="website">', '<meta property="og:locale" content="de_DE">',
         '<meta property="og:site_name" content="CollectView">',
         f'<meta property="og:title" content="{titel}">', f'<meta property="og:description" content="{beschr}">',
         f'<meta property="og:url" content="{url}">', f'<meta property="og:image" content="{OG_BILD}">',
         '<meta property="og:image:width" content="1200">', '<meta property="og:image:height" content="630">',
         '<meta name="twitter:card" content="summary_large_image">']
    if name in ("index", "download"):
        z.append(f'<meta name="apple-itunes-app" content="app-id={APPSTORE_ID}">')
        z.append('<script type="application/ld+json">' + _json.dumps({"@context": "https://schema.org", **APP_LD}, ensure_ascii=False) + '</script>')
    if name == "index":
        z.append('<script type="application/ld+json">' + _json.dumps({"@context": "https://schema.org", "@type": "WebSite", "name": "CollectView", "url": BASIS_URL + "/", "inLanguage": "de"}, ensure_ascii=False) + '</script>')
    z.append('<!-- /seo -->')
    t = re.sub(r"<!-- seo -->.*?<!-- /seo -->\n?", "", t, flags=re.S)
    return t.replace('<link rel="stylesheet" href="assets/site.css">', "\n".join(z) + '\n<link rel="stylesheet" href="assets/site.css">', 1)
for name, inhalt in (("index", index_html), ("download", app_html), ("plus", plus_html), ("support", support_html),
                     ("datenschutz", datenschutz_html), ("impressum", impressum_html)):
    inhalt = seo_block(name, inhalt)
    (HIER / f"{name}.html").write_text(inhalt, encoding="utf-8")
print("Seiten erzeugt:", ", ".join(sorted(p.name for p in HIER.glob("*.html"))))
