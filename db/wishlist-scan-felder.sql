-- Wunschliste: Felder, die ein Scan mitbringt. Im Supabase-SQL-Editor ausführen.
--
-- Hintergrund: Schritt 3 des Scan-Ablaufs gleicht einen Treffer gegen die
-- Wunschliste ab – und zwar über die discogs_id. Bis hierher konnte das
-- nichts finden, weil wishlist_items nur von Hand über wishlist.html
-- befüllt wurde (Titel, Interpret, Format, Jahr) und die Spalte nirgends
-- beschrieben wurde. Seit scanner.js "Auf Wunschliste" anbietet, kommen
-- discogs_id, Cover und Barcode aus dem Discogs-Treffer mit.
--
-- Alle Spalten bleiben nullable: von Hand angelegte Einträge haben
-- naturgemäß keine discogs_id, und die sollen weiter erlaubt sein.

alter table public.wishlist_items add column if not exists discogs_id bigint;
alter table public.wishlist_items add column if not exists cover_url  text;
alter table public.wishlist_items add column if not exists barcode    text;

-- Der Abgleich fragt "meine Wunschliste, diese discogs_ids" – genau darauf
-- liegt der Index. Teilindex, weil die Mehrzahl der Einträge (von Hand
-- angelegt) keine discogs_id hat und im Index nichts verloren hat.
create index if not exists wishlist_items_user_id_discogs_id_idx
  on public.wishlist_items (user_id, discogs_id)
  where discogs_id is not null;
