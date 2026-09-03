-- 7-Tage-Gastzugang (03.09.2026, Cowork): Unentschlossene sollen Plus für
-- 7 Tage testen können, ohne gleich zu zahlen. Start läuft ausschließlich
-- über die Edge Function start-trial (supabase/functions/start-trial) --
-- nie direkt vom Client, sonst könnte sich jeder beliebig oft selbst
-- verlängern. Missbrauchsschutz ist ehrlich begrenzt (siehe dort): eine
-- E-Mail kann nur ein Konto anlegen (Supabase selbst verhindert doppelte
-- Adressen), zusätzlich eine lockere IP-Rate-Begrenzung. Wirklich robust
-- wäre nur ein Trial über Apple/Google IAP direkt (die kennen die
-- Zahlungsmethode) -- das ist Store-seitige Konfiguration, kein Code.

alter table public.profiles
  add column if not exists trial_ends_at timestamptz;

-- Rate-Limit-Gedächtnis für start-trial: kein Client-Zugriff, nur die
-- Function (service_role) liest/schreibt hier. ip_hash statt Klartext-IP,
-- damit bei einem Datenbank-Dump nicht gleich echte IP-Adressen drin
-- stehen -- für eine Rate-Zählung reicht der Hash.
create table if not exists public.trial_starts (
  id uuid primary key default gen_random_uuid(),
  ip_hash text not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists trial_starts_ip_hash_created_idx
  on public.trial_starts (ip_hash, created_at);

alter table public.trial_starts enable row level security;
-- Bewusst keine Policies: nur service_role kommt ran (RLS gilt für
-- anon/authenticated, service_role umgeht sie ohnehin).

-- is_subscribed() ist die einzige Stelle, die alle Plus-Schranken prüft
-- (siehe db/staff-access-presence.sql für den Admin/Mod-Präzedenzfall) --
-- hier um den Testzeitraum erweitert.
create or replace function public.is_subscribed(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
     where id = uid
       and (
         subscription_status = 'active'
         or role in ('admin', 'moderator')
         or trial_ends_at > now()
       )
  );
$$;
