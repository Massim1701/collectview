-- Free-Tier-Sperre: Speichern in die Sammlung und Marktplatz-Zugriff sind
-- ab jetzt CollectView-Plus-exklusiv. Ersetzt das alte "5 kostenlose
-- Scans"-Modell (db/scan-limit.sql) vollständig – Free-Nutzer dürfen
-- beliebig oft manuell nachschlagen, aber nie etwas speichern.

-- 1) collection_items: Insert nur noch mit aktivem Abo.
drop policy if exists "Users can insert own items" on public.collection_items;
create policy "Users can insert own items"
  on public.collection_items for insert
  to authenticated
  with check (auth.uid() = user_id and public.is_subscribed(auth.uid()));

-- 2) marketplace_listings: fremde aktive Angebote nur noch mit Abo sehen
--    (eigene bleiben immer sichtbar, auch ohne Abo).
drop policy if exists "listings_select_active_or_own" on public.marketplace_listings;
create policy "listings_select_active_or_own"
  on public.marketplace_listings for select
  to authenticated
  using (seller_id = auth.uid() or (status = 'active' and public.is_subscribed(auth.uid())));

-- 3) Altes Scan-Limit abschalten: das Speichern ist jetzt ohnehin gesperrt,
--    ein zusätzliches Lifetime-Limit auf die Anzahl der Nachschlagen
--    wollen wir nicht mehr. Tabelle/Policies bleiben (harmlos, evtl.
--    später für Statistik), nur der blockierende Trigger fliegt raus.
drop trigger if exists scan_events_limit on public.scan_events;
