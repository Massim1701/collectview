-- Nutzungsregeln (03.09.2026, Cowork): neue Nutzer müssen beim Registrieren
-- akzeptieren -- das übliche (keine Gewalt, keine NS-Symbole/-Parolen/-Lieder,
-- keine Belästigung, nichts Illegales, kein Spam, respektvoller Umgang).
-- Verstöße beenden CollectView Plus ohne Erstattung -- das ist Policy, kein
-- Automatismus; diese Migration hält nur fest, WANN wer akzeptiert hat.
-- Text steht in app/js/i18n.js (rules_*-Schlüssel, alle 5 Sprachen),
-- Seite ist app/regeln.html. Im Supabase-SQL-Editor ausführen (oder per
-- Management-API, wie üblich in diesem Projekt).

alter table public.profiles
  add column if not exists rules_accepted_at timestamptz;

-- signUp() (auth.js) schickt rules_accepted_at als user_metadata mit, weil
-- zu dem Zeitpunkt (vor einer möglichen E-Mail-Bestätigung) noch keine
-- Sitzung existieren muss, aus der heraus profiles direkt beschrieben
-- werden könnte. handle_new_user() (siehe db/staff-access-presence.sql für
-- den is_anonymous-Präzedenzfall) spiegelt es nur beim Anlegen -- ändert
-- sich am Text etwas, zählt ohnehin nur die Zustimmung der Neuanmeldung,
-- nicht rückwirkend für Bestandsnutzer.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.profiles (id, is_anonymous, rules_accepted_at)
  values (
    new.id,
    coalesce(new.is_anonymous, false),
    (new.raw_user_meta_data ->> 'rules_accepted_at')::timestamptz
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
