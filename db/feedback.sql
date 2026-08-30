-- Feedback aus der App. Im Supabase-SQL-Editor ausführen.
--
-- Absicht der Policies: Angemeldete dürfen Feedback schreiben und
-- ausschließlich ihr eigenes wieder lesen. Es gibt bewusst kein UPDATE und
-- kein DELETE – abgeschicktes Feedback bleibt, wie es abgeschickt wurde.

create table if not exists public.feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  category    text not null check (category in ('fehler', 'wunsch', 'sonstiges')),
  message     text not null check (char_length(message) between 1 and 2000),
  page        text,
  user_agent  text,
  created_at  timestamptz not null default now()
);

create index if not exists feedback_user_id_created_at_idx
  on public.feedback (user_id, created_at desc);

alter table public.feedback enable row level security;

drop policy if exists "Eigenes Feedback schreiben" on public.feedback;
create policy "Eigenes Feedback schreiben"
  on public.feedback for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Eigenes Feedback lesen" on public.feedback;
create policy "Eigenes Feedback lesen"
  on public.feedback for select
  to authenticated
  using (auth.uid() = user_id);
