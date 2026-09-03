-- Drei zusammenhängende Wünsche von Massimo (03.09.2026, Cowork):
-- Admin/Moderator sollen ohne Abo vollen Zugriff haben, es soll eine
-- "wer ist online"-Liste für Admin/Mod geben, und die Nutzerzahlen-Kachel
-- soll nicht mehr die anonymen Scan-Sitzungen mitzählen (siehe
-- db/scan-limit-unlimited.sql / "Scannen ohne Konto": ensureSession()
-- legt für jeden Gast-Scan eine anonyme Supabase-Sitzung an, die bisher
-- als ganz normale Zeile in profiles auftauchte).
-- Im Supabase-SQL-Editor ausführen (oder per Management-API, wie hier).

-- 1) Anonyme Sitzungen erkennbar machen. auth.users.is_anonymous existiert
--    bereits (Supabase-eigene Spalte), aber profiles/Client kommt da nicht
--    ran (RLS/Grants). Deshalb hier gespiegelt.
alter table public.profiles
  add column if not exists is_anonymous boolean not null default false;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.profiles (id, is_anonymous) values (new.id, coalesce(new.is_anonymous, false))
  on conflict (id) do nothing;
  return new;
end;
$$;

-- 2) Zuletzt-gesehen für die Online-Liste. Wird von requireAuth() (auth.js)
--    bei jedem Seitenaufruf einer geschützten Seite gesetzt -- bei der
--    aktuellen Nutzerzahl (siehe admin-Dashboard) unproblematisch; sollte
--    das Wachstum das je spürbar machen, gehört hier ein Throttle rein.
alter table public.profiles
  add column if not exists last_seen_at timestamptz;

-- 3) Admin/Moderator brauchen kein Abo -- sie sind aus dem Jahresbeitrag
--    raus. is_subscribed() ist die einzige Stelle, die alle Plus-Schranken
--    (Sammlung speichern, Marktplatz, Nachrichten) prüfen -- hier
--    erweitert, statt an jeder Policy einzeln.
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
       and (subscription_status = 'active' or role in ('admin', 'moderator'))
  );
$$;

-- 4) Online-Liste, nur für Admin/Mod sichtbar. Die WHERE-Zeile ist die
--    Zugriffssperre: is_moderator(auth.uid()) ist für jede Zeile derselbe
--    Wert (abhängig von der aufrufenden Person, nicht der Zeile) -- für
--    alle anderen liefert die View also leer, ganz ohne RLS auf profiles
--    selbst anzufassen. Anonyme Gast-Sitzungen und Leute ohne Benutzername
--    tauchen bewusst nicht auf (nichts, woran man sie erkennen könnte).
create or replace view public.staff_presence as
  select id, display_name, role, last_seen_at,
         (last_seen_at > now() - interval '5 minutes') as online
    from public.profiles
   where public.is_moderator(auth.uid())
     and is_anonymous = false
     and display_name is not null
   order by last_seen_at desc nulls last;

grant select on public.staff_presence to authenticated;
