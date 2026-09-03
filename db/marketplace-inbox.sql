-- Interner Posteingang für Marktplatz-Nachrichten: kein E-Mail-Versand,
-- stattdessen ein Umschlag-Symbol mit Ungelesen-Zähler in der App.
-- Im Supabase-SQL-Editor ausführen (oder via Management API, wie hier
-- schon geschehen – siehe Session-Verlauf).

-- 1) Ungelesen-Status je Nachricht.
alter table public.marketplace_messages
  add column if not exists read_at timestamptz;

-- 2) Empfänger:in darf die eigene(n) empfangene(n) Nachricht(en) als
--    gelesen markieren (read_at setzen). Kein Update von body/sender
--    etc. vorgesehen, das UI setzt ausschließlich read_at.
drop policy if exists "messages_update_own_read" on public.marketplace_messages;
create policy "messages_update_own_read"
  on public.marketplace_messages for update
  to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());
