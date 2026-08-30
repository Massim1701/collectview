-- Gemeinsamer Tonträger-Katalog. Im Supabase-SQL-Editor ausführen.
--
-- Bisher lag jede Platte so oft in der Datenbank, wie sie jemand besaß:
-- collection_items trug Titel, Interpret, Format, Jahr und Cover pro
-- Nutzer erneut. Discogs wurde entsprechend pro Nutzer erneut gefragt,
-- obwohl die Antwort für alle dieselbe ist – bei 25 Anfragen pro Minute
-- und IP ist das der teuerste Teil des Scans.
--
-- releases trennt deshalb die beiden Fragen:
--   releases         – was IST diese Platte (Stammdaten, für alle gleich)
--   collection_items – WER besitzt sie, wie oft, mit welchen Notizen
--
-- Die Migration ist bewusst additiv: collection_items behält seine
-- bisherigen Spalten, es kommt nur release_id dazu. Die App läuft damit
-- unverändert weiter, auch die Teile, die den Katalog noch nicht kennen.
-- Erst wenn alle Lesepfade über releases gehen, können die doppelten
-- Spalten weg – das ist ein eigener, späterer Schritt.

create table if not exists public.releases (
  id           uuid primary key default gen_random_uuid(),
  discogs_id   bigint not null unique,
  title        text   not null,
  artist       text,
  format       text,
  year         smallint,
  country      text,
  barcode      text,
  cover_url    text,
  label        text,
  catalog_no   text,
  -- Genre war bisher nicht speicherbar; das Home-Dashboard zeigt deshalb
  -- "Formate" statt der vorgesehenen "Genres". Discogs liefert mehrere,
  -- daher ein Array statt einer Spalte.
  genres       text[],
  fetched_at   timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

-- Der Scan sucht über den Barcode, bevor die discogs_id feststeht.
create index if not exists releases_barcode_idx on public.releases (barcode) where barcode is not null;
create index if not exists releases_artist_title_idx on public.releases (artist, title);

alter table public.releases enable row level security;

-- Stammdaten sind für alle Angemeldeten lesbar: genau das ist der Sinn.
drop policy if exists "Katalog lesen" on public.releases;
create policy "Katalog lesen"
  on public.releases for select
  to authenticated
  using (true);

-- Geschrieben wird ausschließlich über upsert_release() unten. Kein
-- direktes INSERT, kein UPDATE, kein DELETE: sonst könnte ein einzelner
-- Nutzer die Stammdaten aller anderen überschreiben.

/**
 * Anlegen oder ergänzen. Gibt die id des Katalogeintrags zurück.
 *
 * Wichtig ist das coalesce: vorhandene Werte werden nie überschrieben,
 * es werden nur Lücken gefüllt. Der Scan kennt anfangs nur die dünnen
 * Felder aus der Discogs-Suche; die Detailseite holt später Label,
 * Katalognummer und Genres nach und trägt sie hier ein. So wächst der
 * Eintrag, ohne dass ein zweiter Nutzer mit schlechteren Daten einen
 * guten Eintrag verschlechtern kann.
 *
 * security definer, weil die Tabelle für Nutzer sonst schreibgeschützt
 * ist; search_path fest, damit die Funktion nicht über einen
 * untergeschobenen Suchpfad umgebogen werden kann.
 */
create or replace function public.upsert_release(daten jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  katalog_id uuid;
  d_id       bigint := nullif(daten->>'discogs_id', '')::bigint;
begin
  if auth.uid() is null then
    raise exception 'RELEASE_ANMELDUNG_NOETIG';
  end if;

  -- Ohne discogs_id gibt es keinen stabilen Schlüssel; solche Einträge
  -- (von Hand angelegt) bleiben allein in collection_items.
  if d_id is null then
    raise exception 'RELEASE_OHNE_DISCOGS_ID';
  end if;

  if coalesce(trim(daten->>'title'), '') = '' then
    raise exception 'RELEASE_OHNE_TITEL';
  end if;

  insert into public.releases as r
    (discogs_id, title, artist, format, year, country, barcode, cover_url, label, catalog_no, genres)
  values (
    d_id,
    daten->>'title',
    nullif(daten->>'artist', ''),
    nullif(daten->>'format', ''),
    nullif(daten->>'year', '')::smallint,
    nullif(daten->>'country', ''),
    nullif(daten->>'barcode', ''),
    nullif(daten->>'cover_url', ''),
    nullif(daten->>'label', ''),
    nullif(daten->>'catalog_no', ''),
    case when jsonb_typeof(daten->'genres') = 'array'
         then array(select jsonb_array_elements_text(daten->'genres'))
    end
  )
  on conflict (discogs_id) do update set
    artist     = coalesce(r.artist,     excluded.artist),
    format     = coalesce(r.format,     excluded.format),
    year       = coalesce(r.year,       excluded.year),
    country    = coalesce(r.country,    excluded.country),
    barcode    = coalesce(r.barcode,    excluded.barcode),
    cover_url  = coalesce(r.cover_url,  excluded.cover_url),
    label      = coalesce(r.label,      excluded.label),
    catalog_no = coalesce(r.catalog_no, excluded.catalog_no),
    genres     = coalesce(r.genres,     excluded.genres),
    fetched_at = now()
  returning r.id into katalog_id;

  return katalog_id;
end;
$$;

revoke all on function public.upsert_release(jsonb) from public;
grant execute on function public.upsert_release(jsonb) to authenticated;

/* ---------- Verknüpfung ---------- */

alter table public.collection_items
  add column if not exists release_id uuid references public.releases(id) on delete set null;
alter table public.wishlist_items
  add column if not exists release_id uuid references public.releases(id) on delete set null;

create index if not exists collection_items_release_id_idx on public.collection_items (release_id);
create index if not exists wishlist_items_release_id_idx   on public.wishlist_items (release_id);

/* ---------- Bestand übernehmen ---------- */

-- Den Katalog aus dem füllen, was die Sammlungen schon wissen. Bei
-- mehreren Zeilen zur selben Platte gewinnt die älteste – sie ist die
-- ursprüngliche Discogs-Antwort, spätere sind Kopien davon.
insert into public.releases (discogs_id, title, artist, format, year, country, barcode, cover_url)
select distinct on (discogs_id)
       discogs_id, title, artist, format, year, country, barcode, cover_url
  from public.collection_items
 where discogs_id is not null
   and coalesce(trim(title), '') <> ''
 order by discogs_id, created_at asc
on conflict (discogs_id) do nothing;

update public.collection_items c
   set release_id = r.id
  from public.releases r
 where c.discogs_id = r.discogs_id
   and c.release_id is null;

update public.wishlist_items w
   set release_id = r.id
  from public.releases r
 where w.discogs_id = r.discogs_id
   and w.release_id is null;
