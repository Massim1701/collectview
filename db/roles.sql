-- Rollen & Moderation. Im Supabase-SQL-Editor ausführen.
--
-- Bereits live angewendet (Cowork, 30.08.2026) – diese Datei dokumentiert
-- den Stand nachträglich nach der db/-Konvention (siehe CLAUDE.md). Alle
-- Anweisungen sind idempotent (create or replace / if not exists / drop
-- policy if exists), ein erneutes Ausführen ist also gefahrlos.
--
-- Absicht: profiles bekommt eine role-Spalte (user/moderator/admin).
-- Die Grenzen (max. 2 Admins, max. 3 Moderatoren) erzwingt ein Trigger,
-- nicht die App – ein Client-Check ließe sich umgehen. role selbst ist
-- vor Fremdänderung geschützt: nur Admins/service_role dürfen sie setzen.

alter table public.profiles add column if not exists role text not null default 'user';
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('user', 'moderator', 'admin'));

-- Zwei kleine Helfer statt der Rollenprüfung an jeder Policy einzeln.
create or replace function public.is_admin(uid uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists(select 1 from profiles where id = uid and role = 'admin');
$$;

create or replace function public.is_moderator(uid uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists(select 1 from profiles where id = uid and role in ('admin', 'moderator'));
$$;

-- Erzwingt die Obergrenzen serverseitig. Zählt ohne die eigene Zeile, damit
-- ein Rollenwechsel bei "schon Admin, bleibt Admin" nicht fälschlich zählt.
create or replace function public.enforce_role_limits()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  admin_count int;
  mod_count int;
begin
  if new.role = 'admin' and (old is null or old.role is distinct from 'admin') then
    select count(*) into admin_count from profiles where role = 'admin' and id <> new.id;
    if admin_count >= 2 then
      raise exception 'Maximal 2 Admins erlaubt.';
    end if;
  end if;

  if new.role = 'moderator' and (old is null or old.role is distinct from 'moderator') then
    select count(*) into mod_count from profiles where role = 'moderator' and id <> new.id;
    if mod_count >= 3 then
      raise exception 'Maximal 3 Moderatoren erlaubt.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_role_limits on public.profiles;
create trigger trg_enforce_role_limits
  before insert or update of role on public.profiles
  for each row execute function public.enforce_role_limits();

-- Erweitert die vorhandene protect_subscription_fields() (schützt bereits
-- subscription_tier/status/renews_at/stripe_customer_id) um role: nur
-- service_role oder ein Admin darf role ändern, alle anderen Updates lassen
-- den Wert unangetastet.
create or replace function public.protect_subscription_fields()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.role() <> 'service_role' then
    new.subscription_tier := old.subscription_tier;
    new.subscription_status := old.subscription_status;
    new.subscription_renews_at := old.subscription_renews_at;
    new.stripe_customer_id := old.stripe_customer_id;
  end if;

  if auth.role() <> 'service_role' and not is_admin(auth.uid()) then
    new.role := old.role;
  end if;

  return new;
end;
$$;

-- Admins dürfen jedes Profil lesen/ändern (Rollenvergabe braucht das),
-- zusätzlich zu den bestehenden profiles_select_own/profiles_update_own.
drop policy if exists profiles_select_admin on public.profiles;
create policy profiles_select_admin on public.profiles
  for select using (is_admin(auth.uid()));

drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles
  for update using (is_admin(auth.uid()));

-- Moderatoren dürfen fremde Marktplatz-Angebote bearbeiten (z. B. entfernen),
-- zusätzlich zum bisherigen "seller_id = auth.uid()".
drop policy if exists listings_update_own on public.marketplace_listings;
create policy listings_update_own on public.marketplace_listings
  for update using (seller_id = auth.uid() or is_moderator(auth.uid()));
