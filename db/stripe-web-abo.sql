-- Abo direkt über die Website (Stripe Checkout), für Nutzer, die die
-- App nicht wollen. Im Supabase-SQL-Editor ausführen.
--
-- Ergänzt db/abo.sql um einen zweiten Zahlweg. Beide Wege schreiben in
-- dieselben Spalten (subscription_status/tier/renews_at) und dürfen sich
-- nicht widersprechen: wer über Stripe zahlt, hat kein store_platform,
-- wer über den Store zahlt, keine stripe_subscription_id. protect_
-- subscription_fields() unten ERSETZT die Fassung aus db/abo.sql (die
-- wiederum die aus db/roles.sql ersetzt hatte) und nimmt die neue Spalte
-- mit auf – läuft abo.sql oder roles.sql später erneut, muss diese Datei
-- danach noch einmal laufen.

alter table public.profiles
  add column if not exists stripe_subscription_id text;

-- Wie profiles_store_kauf_uniq in db/abo.sql: ein Stripe-Abo gehört zu
-- genau einem Konto.
create unique index if not exists profiles_stripe_abo_uniq
  on public.profiles (stripe_subscription_id)
  where stripe_subscription_id is not null;

create or replace function public.protect_subscription_fields()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.role() <> 'service_role' then
    new.subscription_tier      := old.subscription_tier;
    new.subscription_status    := old.subscription_status;
    new.subscription_renews_at := old.subscription_renews_at;
    new.stripe_customer_id     := old.stripe_customer_id;
    new.stripe_subscription_id := old.stripe_subscription_id;

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
-- Checkout abgeschlossen – die Edge Function stripe-webhook ruft das bei
-- checkout.session.completed auf. nutzer kommt aus client_reference_id,
-- die die Edge Function beim Erstellen der Checkout-Session mitgibt –
-- ein Client könnte sich sonst ein fremdes Konto unterschieben.
-- ---------------------------------------------------------------------
create or replace function public.stripe_abo_setzen(
  nutzer      uuid,
  kunde       text,
  abo         text,
  laeuft_bis  timestamptz
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'ABO_NUR_SERVERSEITIG';
  end if;

  update public.profiles
     set subscription_status    = 'active',
         subscription_tier      = coalesce(subscription_tier, 'plus'),
         subscription_renews_at = laeuft_bis,
         stripe_customer_id     = kunde,
         stripe_subscription_id = abo
   where id = nutzer;

  if not found then
    raise exception 'ABO_PROFIL_NICHT_GEFUNDEN';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Laufende Verlängerung/Status-Änderung (customer.subscription.updated).
-- Hier ist kein nutzer bekannt, nur die Stripe-IDs aus dem Webhook-Event
-- – deshalb die Suche über stripe_subscription_id statt über die uuid.
-- ---------------------------------------------------------------------
create or replace function public.stripe_abo_aktualisiert(
  abo         text,
  aktiv       boolean,
  laeuft_bis  timestamptz
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'ABO_NUR_SERVERSEITIG';
  end if;

  update public.profiles
     set subscription_status    = case when aktiv then 'active' else 'expired' end,
         subscription_renews_at = case when aktiv then laeuft_bis else null end
   where stripe_subscription_id = abo;
end;
$$;

-- Endgültig gekündigt/ausgelaufen (customer.subscription.deleted).
-- stripe_subscription_id bleibt stehen, wie store_transaction_id bei
-- abo_beenden() in db/abo.sql – der Kauf hat stattgefunden.
create or replace function public.stripe_abo_beendet(abo text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'ABO_NUR_SERVERSEITIG';
  end if;

  update public.profiles
     set subscription_status    = 'expired',
         subscription_renews_at = null
   where stripe_subscription_id = abo;
end;
$$;

revoke all on function public.stripe_abo_setzen(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.stripe_abo_aktualisiert(text, boolean, timestamptz) from public, anon, authenticated;
revoke all on function public.stripe_abo_beendet(text) from public, anon, authenticated;
