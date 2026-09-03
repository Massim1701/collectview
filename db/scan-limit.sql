-- Free-Limit auf Scans. Im Supabase-SQL-Editor ausführen.
--
-- ACHTUNG: seit dem Free-Scan-Pivot ist dieses Limit AUFGEHOBEN, siehe
-- db/scan-limit-unlimited.sql. Diese Datei bleibt nur als Historie stehen
-- (falls die Tabelle scan_events irgendwo neu angelegt werden muss).
--
-- Ursprüngliche Regel: ohne Abo 5 Scans, mit aktivem Abo unbegrenzt.
--
-- Der Zähler steht bewusst in einer eigenen Tabelle und nicht als Zahl im
-- Profil: so lässt sich später beantworten, wann und womit gescannt wurde,
-- und ein Wechsel auf "5 pro Monat" wäre nur eine andere where-Klausel
-- unten statt einer Datenmigration.
--
-- Achtung, zweite Stelle: die 5 steht auch in app/js/scan-limit.js
-- (FREE_SCAN_LIMIT) – dort nur für die Anzeige "noch 3 von 5". Verbindlich
-- ist der Trigger hier. Wer beide ändert, ändert beide.

create table if not exists public.scan_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  source      text not null check (source in ('barcode', 'cover')),
  term        text,
  created_at  timestamptz not null default now()
);

create index if not exists scan_events_user_id_created_at_idx
  on public.scan_events (user_id, created_at desc);

alter table public.scan_events enable row level security;

drop policy if exists "Eigene Scans schreiben" on public.scan_events;
create policy "Eigene Scans schreiben"
  on public.scan_events for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Eigene Scans lesen" on public.scan_events;
create policy "Eigene Scans lesen"
  on public.scan_events for select
  to authenticated
  using (auth.uid() = user_id);

-- Es gibt bewusst kein DELETE: sonst wäre das Limit mit einem Klick
-- zurückgesetzt.

/**
 * Zählt vor jedem Insert. security definer, weil die Funktion in profiles
 * lesen muss – der Nutzer selbst darf dort nur seine eigene Zeile sehen,
 * und subscription_status ist per Trigger vor Selbstbearbeitung geschützt
 * (siehe ae35d41). search_path fest, damit die Funktion nicht über einen
 * untergeschobenen Suchpfad umgebogen werden kann.
 */
create or replace function public.enforce_scan_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  subscribed boolean;
  used       integer;
begin
  select coalesce(subscription_status = 'active', false)
    into subscribed
    from public.profiles
   where id = new.user_id;

  if subscribed then
    return new;
  end if;

  select count(*) into used
    from public.scan_events
   where user_id = new.user_id;

  if used >= 5 then
    -- Der Wortlaut wird im Client geprüft (isScanLimitError) – wer ihn
    -- ändert, muss app/js/scan-limit.js mitändern.
    raise exception 'SCAN_LIMIT: keine freien Scans mehr'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists scan_events_limit on public.scan_events;
create trigger scan_events_limit
  before insert on public.scan_events
  for each row execute function public.enforce_scan_limit();
