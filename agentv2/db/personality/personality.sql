-- Personality: single row or keyed rows holding markdown content.
-- Use for agent personality instructions; content is markdown, updated_at tracks changes.

create table if not exists public.personality (
  id uuid primary key default gen_random_uuid(),
  key text not null default 'default',
  markdown text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (key)
);

comment on table public.personality is 'Personality instructions as markdown; one row per key (e.g. default).';
comment on column public.personality.markdown is 'Markdown content (personality file body).';
comment on column public.personality.updated_at is 'Last time this row was updated.';

create index if not exists idx_personality_updated_at
  on public.personality (updated_at);

-- Keep updated_at in sync on every UPDATE.
create or replace function public.personality_updated_at_trigger()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger personality_updated_at
  before update on public.personality
  for each row execute function public.personality_updated_at_trigger();
