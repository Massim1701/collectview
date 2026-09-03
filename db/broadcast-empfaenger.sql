-- Rundnachrichten (db/broadcast-nachrichten.sql) bekommen einen optionalen
-- Empfänger: leer = an alle, gesetzt = nur an diese eine Person. So kann
-- Admin/Mod im selben Formular wählen: Broadcast oder gezielt an einen
-- Benutzernamen.

alter table public.broadcasts
  add column if not exists recipient_id uuid references public.profiles(id) on delete cascade;

drop policy if exists "broadcasts_select_all" on public.broadcasts;
create policy "broadcasts_select_all"
  on public.broadcasts for select
  to authenticated
  using (recipient_id is null or recipient_id = auth.uid());
