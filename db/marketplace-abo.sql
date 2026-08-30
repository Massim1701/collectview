-- Marktplatz als Abo-Forum. Im Supabase-SQL-Editor ausführen.
--
-- ============================================================
--  ACHTUNG: REKONSTRUKTION – NICHT UNGEPRÜFT AUSFÜHREN
-- ============================================================
-- Diese Datei wurde nachträglich aus der Commit-Beschreibung von e25ee1e
-- und ae35d41 geschrieben, nicht aus dem echten Schema. Die Änderungen
-- wurden seinerzeit von Hand im SQL-Editor gemacht und nirgends abgelegt.
--
-- Der Spalten- und Funktionsteil unten ist unkritisch: er ist idempotent
-- und ändert nichts, was schon steht.
--
-- Der POLICY-Teil ist es NICHT. "drop policy / create policy" ersetzt die
-- laufenden Regeln durch die hier notierten – wenn die Rekonstruktion vom
-- Original abweicht, ändert das die Sichtbarkeit fremder Daten. Vor dem
-- Ausführen gegen die echten Policies halten:
--
--   select policyname, cmd, qual, with_check
--     from pg_policies
--    where schemaname = 'public'
--      and tablename in ('marketplace_listings', 'marketplace_messages');
--
-- Stimmt etwas nicht überein, gilt die Datenbank, nicht diese Datei.

/* ---------- Spalten und Funktion (unkritisch) ---------- */

-- Bei "Gesucht"-Beiträgen ist kein Preis nötig.
alter table public.marketplace_listings alter column price_cents drop not null;

alter table public.marketplace_listings
  add column if not exists kind text not null default 'biete';

do $$
begin
  alter table public.marketplace_listings
    add constraint marketplace_listings_kind_check
    check (kind in ('biete', 'gesucht'));
exception
  when duplicate_object then null;
end $$;

-- Hat der Nutzer ein aktives Abo? Wird von den Policies unten benutzt.
-- security definer, damit die Prüfung nicht selbst an den profiles-Policies
-- hängen bleibt; search_path fest, damit die Funktion nicht über einen
-- untergeschobenen Suchpfad umgebogen werden kann.
create or replace function public.is_subscribed(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
     where id = uid and subscription_status = 'active'
  );
$$;

/* ---------- Policies (PRÜFEN, siehe Kopf) ---------- */
-- Bewusst auskommentiert. Erst mit dem Ergebnis der pg_policies-Abfrage
-- oben abgleichen, dann gezielt einkommentieren und ausführen.
--
-- drop policy if exists "Fremde Angebote nur mit Abo" on public.marketplace_listings;
-- create policy "Fremde Angebote nur mit Abo"
--   on public.marketplace_listings for select
--   to authenticated
--   using (auth.uid() = user_id or (status = 'active' and public.is_subscribed(auth.uid())));
--
-- drop policy if exists "Angebote anlegen nur mit Abo" on public.marketplace_listings;
-- create policy "Angebote anlegen nur mit Abo"
--   on public.marketplace_listings for insert
--   to authenticated
--   with check (auth.uid() = user_id and public.is_subscribed(auth.uid()));
--
-- drop policy if exists "Nachrichten schreiben nur mit Abo" on public.marketplace_messages;
-- create policy "Nachrichten schreiben nur mit Abo"
--   on public.marketplace_messages for insert
--   to authenticated
--   with check (auth.uid() = sender_id and public.is_subscribed(auth.uid()));
