# App Store Connect: CollectView iOS 1.0 abhaken

Stand 27.10.2026. App-ID in App Store Connect: 6807394925 (Status "Prepare for Submission").
Texte stehen in `store/STORE-TEXTE.md`. Ich habe die Seiten dort nicht lesen können
(Versionsseite lud nicht); prüf bei jedem Punkt, ob er schon ausgefüllt ist.

## 1. Build hochladen (Xcode)
- [ ] `./scripts/build-www.sh && npx cap sync ios`, dann `ios/App/App.xcodeproj` in Xcode öffnen
- [ ] Version 1.0, Build 1 (bei erneutem Upload Build hochzählen), Team und Signierung wählen
- [ ] Product > Archive > Distribute App > App Store Connect > Upload
- [ ] Exportbestimmungen: App nutzt nur Standard-HTTPS -> "Nein, ausgenommen". Dauerhaft lösen:
      in `Info.plist` `ITSAppUsesNonExemptEncryption` = NO eintragen (sonst fragt Apple bei jedem Upload)

## 2. App-Informationen
- [ ] Name CollectView, Untertitel "Platten & CDs scannen" (max. 30 Zeichen)
- [ ] Kategorie Musik (primär), Lifestyle (optional)
- [ ] Datenschutz-URL https://collectview.site/datenschutz (Seite muss die Korrekturen aus
      `store/DATENSCHUTZ-TEXTBAUSTEINE.md` enthalten, sonst widerspricht sie den Angaben unten)
- [ ] Inhaltsrechte: "Zeigt die App Inhalte Dritter?" Ja (Discogs-Daten und Cover), Rechte vorhanden
      im Rahmen der Discogs-API-Bedingungen; Namen/Marke: "nicht mit Discogs verbunden" steht im Text

## 3. Preis und Verfügbarkeit
- [ ] Preis: Kostenlos (Stufe 0), alle Länder
- [ ] Keine In-App-Käufe, keine Abos anlegen (Paid-Applications-Vertrag nicht nötig)

## 4. Altersfreigabe (Fragebogen)
- [ ] Alles "Keine/Nie". Ergebnis 4+. Kein Web-Zugriff mit uneingeschränkten Inhalten (nur Links
      zu Streamingdiensten), kein nutzergenerierter Inhalt in der App

## 5. App-Datenschutz (ehrlich, passt zum Code)
- [ ] Tracking: **Nein**
- [ ] Gesammelte Daten:
  - Fotos oder Videos: nur beim Cover-Foto (Bild geht zur Erkennung an den Server und Google Gemini,
    wird nicht gespeichert). Zweck App-Funktionalität, nicht verknüpft, kein Tracking
  - Benutzer-ID: anonyme Kennung des Gastkontos. Zweck App-Funktionalität, verknüpft mit Identität: Ja
  - Kontaktinfo E-Mail: nur wer sich anmeldet. Zweck App-Funktionalität/Kontoverwaltung, verknüpft
  - Nutzungsdaten (Scan-Zähler pro Konto, Missbrauchsschutz): Zweck App-Funktionalität, verknüpft
- [ ] Nicht ankreuzen: Standort, Kontakte, Gesundheit, Finanzen, Werbedaten, Diagnosedaten

## 6. Versionsseite 1.0
- [ ] Screenshots: iPhone 6,9" (1320x2868) Pflicht; iPad nur, wenn die App iPad unterstützt
      (Info.plist hat iPad-Ausrichtungen; "Gerätefamilie" in Xcode prüfen)
- [ ] Beschreibung, Keywords, Support-URL https://collectview.site/support, Version "Was ist neu"
- [ ] Copyright: © 2026 Driftware
- [ ] Build auswählen (erscheint nach der Verarbeitung, ca. 10-30 Minuten)

## 7. App-Überprüfung
- [ ] Anmeldung erforderlich? **Nein** (Scannen geht ohne Konto)
- [ ] Kontakt: Name, E-Mail, Telefon (Pflichtfeld)
- [ ] Notizen für Prüfer: Text aus `store/STORE-TEXTE.md` ("Review-Hinweis für Apple")
- [ ] Hinweis ergänzen: Barcode-Scan braucht eine Kamera; ohne Kamera Barcode-Nummer eintippen,
      z. B. 0720642442524 (Nirvana, Nevermind)

## 8. Vor "Zur Prüfung einreichen"
- [ ] Kein Preis, kein Kauf-Link, kein "Plus" in App oder Screenshots (Richtlinie 3.1.1)
- [ ] Datenschutzseite live und mit Stripe/Web-Abo-Text korrigiert
- [ ] Veröffentlichung: "Manuell freigeben" wählen, dann veröffentlichst du selbst
