# Datenschutzerklärung: Korrekturen für collectview.site/datenschutz

**Fertiger Block zum Einfügen: `store/datenschutz-body.html`** (ganzer Inhalt von `<h1>` bis zum letzten `</p>`, passend zur Live-Seite mit Anschrift). Die Abschnitte unten sind die Begründung.

Stand 27.10.2026. Die Live-Seite (Cloudflare Worker `collectview-site`, Quick Edit) sagt noch
"Abo-Käufe laufen über Apple bzw. Google". Das stimmt nicht mehr: Die App ist kostenlos, das
Abo gibt es nur im Web per Stripe. Die Abschnitte unten ersetzen die gleichnamigen Abschnitte
im Worker (`privacyHtml()`); alles andere bleibt. Vor Veröffentlichung rechtlich gegenlesen
(siehe OFFEN.md, Rechtsprüfung), ich bin kein Rechtsanwalt.

## Konto & Anmeldung (ersetzt den bisherigen Abschnitt)
Die App kann ohne Konto genutzt werden. Dabei legt sie im Hintergrund ein anonymes Gastkonto an
(technische Kennung, keine E-Mail-Adresse), damit das Scan-Kontingent gezählt werden kann.
Ein Konto mit E-Mail-Adresse und Passwort legst du auf collectview.site an. In der App kannst
du dich damit anmelden. Die Anmeldedaten werden über Supabase Auth verwaltet.

## Abo & Zahlung (ersetzt "Abo & Kauf")
Die App ist kostenlos und enthält keine Käufe. CollectView Plus (Sammlung, Wunschliste,
Marktplatz) ist ein Abo, das du ausschließlich auf der Webseite abschließt. Die Zahlung wickelt
Stripe Payments Europe, Ltd. ab. Deine Zahlungsdaten (z. B. Kartennummer) gibt du direkt bei
Stripe ein; wir sehen und speichern sie nicht. Wir erhalten von Stripe nur den Status deines
Abos (aktiv, gekündigt) und die Zuordnung zu deinem Konto. Rechtsgrundlage ist die
Vertragserfüllung (Art. 6 Abs. 1 lit. b DSGVO). Kündigen kannst du jederzeit zum Ende der
Laufzeit.

## Scan-Verlauf (neu)
Der Verlauf deiner letzten Scans wird nur lokal auf deinem Gerät gespeichert. Pro Scan wird
serverseitig lediglich gezählt, dass ein Scan stattfand (Missbrauchsschutz), ohne Inhalt.

## Cover-Scan (bleibt, Ergänzung)
Beim Cover-Foto wird das Bild nur zur Erkennung an unseren Server und von dort an Google
(Gemini) übermittelt und nicht dauerhaft bei uns gespeichert. Barcodes werden auf deinem Gerät
gelesen, dabei verlässt kein Bild das Gerät.

## Empfänger / Auftragsverarbeiter (neu, falls noch nicht vorhanden)
Supabase (Datenbank und Anmeldung, EU-Region Frankfurt), Cloudflare (Auslieferung der Webseite),
Stripe (Zahlung), Google (Bilderkennung beim Cover-Foto), Discogs (Katalogdaten, Marktwerte).

## Zu prüfen, bevor du es einfügst
- Stimmt die Supabase-Region? (Projekt plattenregal liegt in eu-central-1.)
- Ist Stripe als Abo-Abwickler endgültig und gibt es auch ein Kündigungsportal im Konto?
- Wird für Gastkonten wirklich nur eine anonyme ID gespeichert?
