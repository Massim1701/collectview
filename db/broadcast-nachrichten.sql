-- Rundnachrichten von Admin/Mod an alle Nutzer:innen.
-- Im Supabase-SQL-Editor ausführen (oder via Management API, wie hier).

create table if not exists public.broadcasts (
  id         uuid primary key default gen_random_uuid(),
  sender_id  uuid references public.profiles(id) on delete set null,
  body       text not null,
  created_at timestamptz not null default now()
);

alter table public.broadcasts enable row level security;

-- Alle angemeldeten Nutzer:innen dürfen Rundnachrichten lesen.
drop policy if exists "broadcasts_select_all" on public.broadcasts;
create policy "broadcasts_select_all"
  on public.broadcasts for select
  to authenticated
  using (true);

-- Nur Admin/Mod dürfen welche verfassen.
drop policy if exists "broadcasts_insert_staff" on public.broadcasts;
create policy "broadcasts_insert_staff"
  on public.broadcasts for insert
  to authenticated
  with check (public.is_moderator(auth.uid()));

-- Zeitpunkt, bis zu dem eine Person ihre Rundnachrichten gelesen hat
-- (fürs Ungelesen-Badge im Posteingang, analog zu last_seen_at).
alter table public.profiles
  add column if not exists broadcasts_seen_at timestamptz;
