-- Current memory facts. One row per (scope, key); upsert overwrites.
-- Use '' for channel_id/guild_id/user_id when not scoped so uniqueness works.

create table if not exists public.memory (
  id uuid primary key default gen_random_uuid(),
  channel_id text not null default '',
  guild_id text not null default '',
  user_id text not null default '',
  key text not null,
  value jsonb not null,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (channel_id, guild_id, user_id, key)
);

comment on table public.memory is 'Current agent memory facts; key-value by scope (channel/guild/user).';
comment on column public.memory.value is 'Fact payload (string, number, or object).';
comment on column public.memory.metadata is 'Optional: source message_id, tool_call_id, etc.';

create index if not exists idx_memory_scope
  on public.memory (channel_id, guild_id, user_id);
create index if not exists idx_memory_updated_at
  on public.memory (updated_at);


/* jsonb metadata example

{
  "message_id": "1234567890",
  "tool_call_id": "1234567890",
  "user_id": "1234567890",
  "channel_id": "1234567890",
  "guild_id": "1234567890"
}
*/