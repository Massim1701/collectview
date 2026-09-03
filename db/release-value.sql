-- Marktwert je Release. Im Supabase-SQL-Editor ausführen (oder via CLI-Deploy,
-- siehe OFFEN.md).
--
-- Der Marktwert gehört zu releases, nicht zu collection_items: der Preis
-- einer Pressung ist für alle Besitzer gleich, genau wie Titel und Cover
-- (siehe db/releases.sql). Ein Nutzer lädt den Preis, alle profitieren –
-- und Discogs wird nicht pro Sammlung erneut gefragt.
--
-- value_low/median/high sind die Randwerte der Discogs-Preisvorschläge
-- (marketplace/price_suggestions) über alle Zustandsstufen. Ohne Vorschläge
-- (z.B. keine Marktplatz-Historie) fällt die Edge Function auf lowest_price
-- des Release zurück; dann sind low = median = high derselbe Wert.

alter table public.releases
  add column if not exists value_low        numeric(10,2),
  add column if not exists value_median      numeric(10,2),
  add column if not exists value_high        numeric(10,2),
  add column if not exists value_currency    text,
  add column if not exists value_fetched_at  timestamptz;

-- Schreibender Zugriff bleibt wie bei allen anderen releases-Spalten der
-- Service-Role vorbehalten (die Edge Function discogs-preis nutzt sie);
-- die bestehende "Katalog lesen"-Policy deckt das Lesen bereits ab.
