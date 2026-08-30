-- Sammlung: Anzahl eigener Exemplare. Im Supabase-SQL-Editor ausführen.
--
-- Nachgereicht: die Spalte wurde am 30.08.2026 von Hand angelegt, die
-- Migration fehlte im Repo. Der Client (detail.js) begrenzt zusätzlich auf
-- 1–10, damit die Stepper-Buttons gar nicht erst gegen diesen Check laufen –
-- der Check hier ist die eigentliche Zusicherung, nicht der Client.

alter table public.collection_items
  add column if not exists quantity smallint not null default 1;

do $$
begin
  alter table public.collection_items
    add constraint collection_items_quantity_check
    check (quantity between 1 and 10);
exception
  when duplicate_object then null;
end $$;
