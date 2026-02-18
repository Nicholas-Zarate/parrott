-- Full-text search index for parrot_conversation_history (user_text + response_text).
-- Generated column updates automatically on insert/update.

alter table public.parrot_conversation_history
add column if not exists fts tsvector
generated always as (
  to_tsvector(
    'english',
    coalesce(user_text, '') || ' ' || coalesce(response_text, '')
  )
) stored;

create index if not exists idx_conversation_history_fts
on public.parrot_conversation_history using gin (fts);

comment on column public.parrot_conversation_history.fts is 'Full-text search vector over user_text and response_text; used by search_conversation_history RPC.';
