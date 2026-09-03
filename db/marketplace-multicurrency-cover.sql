-- Mehrere Währungen im Marktplatz (currency existiert schon, war aber im
-- Formular fest auf EUR verdrahtet – siehe app/listing-new.html) und ein
-- optionales Rückseiten-Cover zusätzlich zum vorhandenen cover_url (Vorderseite).

alter table public.marketplace_listings
  add column if not exists cover_url_back text;

alter table public.marketplace_listings
  alter column currency set default 'EUR';
