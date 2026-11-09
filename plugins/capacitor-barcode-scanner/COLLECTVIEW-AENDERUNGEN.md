# Lokale Kopie von @capacitor/barcode-scanner 3.1.3 (MIT, OutSystems)

Warum eine Kopie: Der iOS-Scanner startete immer mit der normalen Kamera (1x), die erst ab etwa 15-20 cm
scharf stellt. Barcodes auf Plattenhuellen haelt man aber nah ans Telefon; Massimo musste von Hand die
Kamera wechseln (0,5x). Die Optionen des Plugins erlauben keine Kameraauswahl.

Aenderungen (alle mit `COLLECTVIEW` im Code markiert):
- `Package.swift`: OSBarcodeLib-iOS 3.0.1 kommt aus dem Unterordner `OSBarcodeLib-iOS/` statt von GitHub
  (dessen Package.swift ohne Test-Target).
- `OSBarcodeLib-iOS/.../OSBARCCaptureSessionManager.swift`: Start mit der Ultraweitwinkel-Kamera (0,5x), wenn
  vorhanden, sonst normale Kamera; Dauerfokus mit Nahbereich-Beschraenkung (`configureForBarcodeFocus`).
- `OSBarcodeLib-iOS/.../OSBARCScannerViewModel.swift`: Zoom-Anzeige startet auf 0,5x, wenn es die Kamera gibt.
- Android ist unveraendert (ML Kit).

Beim Update des Originals: Aenderungen mit `grep -rn COLLECTVIEW .` wiederfinden und neu anwenden.
