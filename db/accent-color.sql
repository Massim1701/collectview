-- Plus-Akzentfarbe. Im Supabase-SQL-Editor ausführen (oder per Management-
-- API wie die übrigen db/*.sql, siehe OFFEN.md).
--
-- Absicht: Alle Nutzer, auch Free, sehen dasselbe feste Neongrün des
-- Tonstudio-Themes (--accent in wireframes/styles.css) – das ist die
-- Markenfarbe. CollectView-Plus-Abonnenten können sie stattdessen durch
-- eine von sechs Farben ersetzen (rot/gelb/gruen/blau/silber/gold).
-- Bewusst kein Neon-Lime als Grün-Option in der CSS-Palette: ein
-- Plus-Nutzer soll auf den ersten Blick von einem Free-Nutzer zu
-- unterscheiden sein, nicht denselben Farbeindruck bekommen.
--
-- Die Grenze (nur mit aktivem Abo) erzwingt ein Trigger, nicht nur der
-- Client – sonst könnte ein Free-Nutzer per direktem API-Aufruf
-- mitfärben. Alle Anweisungen sind idempotent, ein erneutes Ausführen
-- ist gefahrlos.

alter table public.profiles add column if not exists accent_color text;
alter table public.profiles drop constraint if exists profiles_accent_color_check;
alter table public.profiles add constraint profiles_accent_color_check
  check (accent_color is null or accent_color in ('rot', 'gelb', 'gruen', 'blau', 'silber', 'gold'));

-- Eigene, von protect_subscription_fields() (db/abo.sql) unabhängige
-- Funktion/Trigger, damit ein erneutes Ausführen von abo.sql oder
-- roles.sql diese Regel nicht überschreiben kann (siehe die ACHTUNG-Notiz
-- in roles.sql zur Lauf-Reihenfolge).
create or replace function public.protect_accent_color()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.accent_color is not null
     and auth.role() <> 'service_role'
     and coalesce(new.subscription_status, 'inactive') <> 'active' then
    new.accent_color := old.accent_color;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_accent_color on public.profiles;
create trigger trg_protect_accent_color
  before insert or update of accent_color on public.profiles
  for each row execute function public.protect_accent_color();
