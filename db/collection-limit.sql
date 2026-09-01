-- Free-Limit auf Sammlungseinträge. Im Supabase-SQL-Editor ausführen.
--
-- Regel: ohne Abo 5 Tonträger in der Sammlung, mit aktivem Abo unbegrenzt.
--
-- Diese Datei holt nach, was fehlte: Trigger und Funktion liefen seit
-- jeher in der Produktionsdatenbank, standen aber in keinem File im Repo.
-- Wer die Regel lesen oder ändern wollte, fand nichts – und der Text der
-- Fehlermeldung trug noch den alten Produktnamen, die einzige Stelle, an
-- der Nutzern "Plattenregal" überhaupt noch begegnete.
--
-- Achtung: das ist eine ZWEITE Schranke neben db/scan-limit.sql. Die
-- begrenzt das Scannen (5 Scans), diese das Ergebnis (5 Einträge) –
-- auch von Hand angelegte. Wer das Free-Modell ändert, muss an beide
-- denken.

create or replace function public.enforce_collection_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  item_count integer;
begin
  if not public.is_subscribed(new.user_id) then
    select count(*) into item_count
      from public.collection_items
     where user_id = new.user_id;

    if item_count >= 5 then
      raise exception 'Free-Limit erreicht: In der kostenlosen Version sind maximal 5 Tonträger möglich. Mit CollectView Plus unbegrenzt.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists on_collection_insert_limit on public.collection_items;
create trigger on_collection_insert_limit
  before insert on public.collection_items
  for each row execute function public.enforce_collection_limit();
