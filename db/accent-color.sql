-- Plus-Akzentfarbe. Im Supabase-SQL-Editor ausführen (oder per Management-
-- API wie die übrigen db/*.sql, siehe OFFEN.md).
--
-- Absicht: Alle Nutzer, auch Free, sehen dasselbe feste Neongrün des
-- Tonstudio-Themes (--accent in wireframes/styles.css) – das ist die
-- Markenfarbe. CollectView-Plus-Abonnenten können sie stattdessen durch
-- eine von fünf Farben ersetzen (grau/gelb/rot/gruen/orange).
-- Bewusst kein Neon-Lime als Grün-Option in der CSS-Palette: ein
-- Plus-Nutzer soll auf den ersten Blick von einem Free-Nutzer zu
-- unterscheiden sein, nicht denselben Farbeindruck bekommen.
--
-- Die Grenze (nur mit aktivem Abo) erzwingt ein Trigger, nicht nur der
-- Client – sonst könnte ein Free-Nutzer per direktem API-Aufruf
-- mitfärben. Alle Anweisungen sind idempotent, ein erneutes Ausführen
-- ist gefahrlos.

alter table public.profiles add column if not exists accent_color text;

-- 02.09.2026 (Massimo, Cowork): Palette von sechs auf fünf Farben
-- geändert -- grau/gelb/rot/gruen/orange statt rot/gelb/gruen/blau/
-- silber/gold. "silber" wird zu "grau" (gleicher Farbwert, nur
-- umbenannt), "blau"/"gold" entfallen ersatzlos. Bestehende Profile
-- zuerst migrieren, bevor der neue Constraint sie sonst ablehnt.
update public.profiles set accent_color = 'grau' where accent_color = 'silber';
update public.profiles set accent_color = null where accent_color in ('blau', 'gold');

alter table public.profiles drop constraint if exists profiles_accent_color_check;
alter table public.profiles add constraint profiles_accent_color_check
  check (accent_color is null or accent_color in ('grau', 'gelb', 'rot', 'gruen', 'orange'));

-- Eigene, von protect_subscription_fields() (db/abo.sql) unabhängige
-- Funktion/Trigger, damit ein erneutes Ausführen von abo.sql oder
-- roles.sql diese Regel nicht überschreiben kann (siehe die ACHTUNG-Notiz
-- in roles.sql zur Lauf-Reihenfolge).
--
-- 02.09.2026 erweitert: die erste Fassung blockierte nur das SETZEN einer
-- Farbe ohne aktives Abo, löschte eine schon gesetzte Farbe aber nicht,
-- wenn das Abo danach ausläuft (abo_beenden() in abo.sql ändert nur
-- subscription_status, nie accent_color – der alte Wert blieb also
-- einfach stehen). Damit hätte ein Nutzer nach Kündigung optisch weiter
-- als Plus durchgegangen, obwohl genau das laut Kommentar oben vermieden
-- werden soll. Jetzt räumt derselbe Trigger auch bei jeder Änderung von
-- subscription_status auf: verlässt es 'active', wird accent_color mit
-- geräumt, ganz gleich wer den Schreibzugriff macht.
create or replace function public.protect_accent_color()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if coalesce(new.subscription_status, 'inactive') <> 'active' then
    new.accent_color := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_accent_color on public.profiles;
create trigger trg_protect_accent_color
  before insert or update of accent_color, subscription_status on public.profiles
  for each row execute function public.protect_accent_color();
