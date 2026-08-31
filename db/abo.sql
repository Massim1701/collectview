-- Abo über In-App-Kauf. Im Supabase-SQL-Editor ausführen.
--
-- Bisher war das Abo unerreichbar: die App LIEST subscription_status
-- (db.js, marketplace-Policies), aber nichts im ganzen Projekt konnte
-- ihn setzen. Niemand konnte Abonnent werden, ausser jemand änderte die
-- Zeile von Hand.
--
-- Der Zahlweg ist der In-App-Kauf von Apple und Google. Beide verlangen
-- für digitale Abos ihre eigene Abwicklung; der ursprünglich geplante
-- Stripe-Weg (stripe_customer_id) wird im Store-Kontext nicht
-- zugelassen. Die Stripe-Spalten bleiben trotzdem stehen: ein Abo, das
-- vor dem Store-Start über die Web-Seite verkauft wurde, soll gültig
-- bleiben.
--
-- Was hier NICHT passiert: die Prüfung des Belegs. Die läuft in der Edge
-- Function abo-pruefen gegen Apple bzw. Google, weil sie Geheimnisse
-- braucht, die nirgends in der Datenbank stehen dürfen.

alter table public.profiles
  add column if not exists store_platform        text,
  add column if not exists store_product_id      text,
  add column if not exists store_transaction_id  text,
  add column if not exists store_verified_at     timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_store_platform_check') then
    alter table public.profiles
      add constraint profiles_store_platform_check
      check (store_platform is null or store_platform in ('apple', 'google'));
  end if;
end $$;

-- Ein Kauf gehört zu genau einem Konto.
--
-- Ohne das könnte derselbe Beleg beliebig vielen Konten ein Abo
-- verschaffen: Kauf einmal tätigen, Beleg weitergeben, fertig. Der Kauf
-- ist bei Apple die originalTransactionId, bei Google der purchaseToken
-- – beide bleiben über die gesamte Laufzeit eines Abos gleich, taugen
-- also als dauerhafter Schlüssel.
create unique index if not exists profiles_store_kauf_uniq
  on public.profiles (store_platform, store_transaction_id)
  where store_transaction_id is not null;

-- ---------------------------------------------------------------------
-- Schutz der Abo-Felder
--
-- Diese Fassung ERSETZT die aus db/roles.sql und nimmt die vier neuen
-- Store-Spalten mit auf. Ohne das wäre die Absicherung wertlos: ein
-- Client könnte sich zwar weiterhin keinen subscription_status setzen,
-- aber store_transaction_id beliebig überschreiben und damit einen
-- fremden Kauf für sich beanspruchen.
--
-- Läuft roles.sql später erneut, überschreibt es diese Fassung wieder –
-- dann muss abo.sql danach noch einmal laufen. Deshalb steht in
-- roles.sql ein Hinweis darauf.
-- ---------------------------------------------------------------------

create or replace function public.protect_subscription_fields()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.role() <> 'service_role' then
    new.subscription_tier      := old.subscription_tier;
    new.subscription_status    := old.subscription_status;
    new.subscription_renews_at := old.subscription_renews_at;
    new.stripe_customer_id     := old.stripe_customer_id;

    new.store_platform         := old.store_platform;
    new.store_product_id       := old.store_product_id;
    new.store_transaction_id   := old.store_transaction_id;
    new.store_verified_at      := old.store_verified_at;
  end if;

  if auth.role() <> 'service_role' and not is_admin(auth.uid()) then
    new.role := old.role;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Abo setzen – nur für die Edge Function
--
-- Die Function hat den service_role-Schlüssel und könnte profiles auch
-- direkt aktualisieren. Trotzdem eine eigene Funktion: sie hält die
-- Regeln an einem Ort (welcher Kauf gehört wem, was passiert bei einem
-- bereits vergebenen Beleg) statt sie in TypeScript zu verstreuen, und
-- sie macht den Vorgang atomar.
--
-- Absichtlich ohne Prüfung des Belegs: die ist zu diesem Zeitpunkt schon
-- gegen Apple bzw. Google gelaufen. Wer diese Funktion aufrufen darf,
-- hat den service_role-Schlüssel – und wer den hat, kann ohnehin alles.
-- ---------------------------------------------------------------------

create or replace function public.abo_setzen(
  nutzer        uuid,
  plattform     text,
  produkt       text,
  transaktion   text,
  laeuft_bis    timestamptz
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  fremd uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'ABO_NUR_SERVERSEITIG';
  end if;

  -- Gehört der Beleg schon jemand anderem, ist etwas faul: entweder ein
  -- weitergegebener Kauf oder ein Kontowechsel. Beides gehört gemeldet,
  -- nicht stillschweigend übernommen.
  select id into fremd
    from public.profiles
   where store_transaction_id = transaktion
     and store_platform = plattform
     and id <> nutzer;

  if fremd is not null then
    raise exception 'ABO_BELEG_GEHOERT_ANDEREM_KONTO';
  end if;

  update public.profiles
     set subscription_status    = 'active',
         subscription_tier      = coalesce(subscription_tier, 'plus'),
         subscription_renews_at = laeuft_bis,
         store_platform         = plattform,
         store_product_id       = produkt,
         store_transaction_id   = transaktion,
         store_verified_at      = now()
   where id = nutzer;

  if not found then
    raise exception 'ABO_PROFIL_NICHT_GEFUNDEN';
  end if;
end;
$$;

-- Abo beenden – für abgelaufene oder zurückgezogene Käufe.
create or replace function public.abo_beenden(nutzer uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'ABO_NUR_SERVERSEITIG';
  end if;

  -- store_transaction_id bleibt stehen: der Kauf hat stattgefunden, und
  -- der Eintrag verhindert weiterhin, dass derselbe Beleg anderswo
  -- eingelöst wird.
  update public.profiles
     set subscription_status    = 'expired',
         subscription_renews_at = null
   where id = nutzer;
end;
$$;

revoke all on function public.abo_setzen(uuid, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.abo_beenden(uuid) from public, anon, authenticated;
