-- Scannen ist jetzt unbegrenzt und ohne Konto möglich (Pivot: kostenloser
-- Köder, nur die Sammlung ist CollectView Plus vorbehalten). Der alte
-- 5-Scans-Trigger aus db/scan-limit.sql (enforce_scan_limit) würde das
-- aushebeln, also weg damit. Im Supabase-SQL-Editor ausführen (oder via
-- Management-API, siehe OFFEN.md) -- bereits live angewendet.
--
-- Die Tabelle scan_events bleibt bestehen (Verlauf/Analytics schadet
-- nicht), nur die Sperre fällt.

drop trigger if exists scan_events_limit on public.scan_events;
drop function if exists public.enforce_scan_limit();
