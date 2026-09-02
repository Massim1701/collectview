-- Premium-Erkennbarkeit im Marktplatz ("Beiträge"). Im Supabase-SQL-Editor
-- ausführen (oder per Management-API wie die übrigen db/*.sql).
--
-- Wunsch von Massimo (02.09.2026, Cowork): Plus-Kund:innen sollen in den
-- Marktplatz-Beiträgen sofort als solche erkennbar sein -- nicht nur im
-- eigenen Konto. Dafür braucht die Karte pro Beitrag den Abo-Status und
-- die Akzentfarbe der/des Verkäufer:in.
--
-- profiles_public (siehe db/roles.sql-Umfeld) exponiert bisher nur
-- id + display_name -- bewusst kein subscription_status, keine E-Mail.
-- subscription_status und accent_color sind aber genau der Sinn dieser
-- Funktion (öffentlich sichtbares Abzeichen), keine sensiblen Daten wie
-- die E-Mail -- deshalb hier ergänzt, nicht als Ausnahme woanders.
--
-- Idempotent: create or replace view ändert nur die Spaltenliste, keine
-- bestehenden Policies oder Grants.
create or replace view public.profiles_public as
  select id, display_name, accent_color, subscription_status
  from public.profiles;
