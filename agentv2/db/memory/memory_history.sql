-- History of memory changes (previous value before update/delete).
-- Populate via trigger on memory UPDATE/DELETE so we can see what changed and when.

create table if not exists public.memory_history (
  id uuid primary key default gen_random_uuid(),
  memory_id uuid,
  channel_id text not null default '',
  guild_id text not null default '',
  user_id text not null default '',
  key text not null,
  value jsonb not null,
  metadata jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  changed_at timestamptz not null default now(),
  operation text not null check (operation in ('update', 'delete'))
);

comment on table public.memory_history is 'Snapshot of memory row before update/delete; for audit and "what changed when".';
comment on column public.memory_history.operation is 'update = row was overwritten; delete = row was removed.';

create index if not exists idx_memory_history_scope
  on public.memory_history (channel_id, guild_id, user_id);
create index if not exists idx_memory_history_changed_at
  on public.memory_history (changed_at);
create index if not exists idx_memory_history_memory_id
  on public.memory_history (memory_id);

-- Optional: trigger to copy old row into memory_history on UPDATE/DELETE.
-- Uncomment and run after memory table exists.
/*
create or replace function public.memory_audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    insert into public.memory_history (
      memory_id, channel_id, guild_id, user_id, key, value, metadata, created_at, updated_at, operation
    ) values (
      old.id, old.channel_id, old.guild_id, old.user_id, old.key, old.value, old.metadata,
      old.created_at, old.updated_at, 'update'
    );
  elsif tg_op = 'DELETE' then
    insert into public.memory_history (
      memory_id, channel_id, guild_id, user_id, key, value, metadata, created_at, updated_at, operation
    ) values (
      old.id, old.channel_id, old.guild_id, old.user_id, old.key, old.value, old.metadata,
      old.created_at, old.updated_at, 'delete'
    );
  end if;
  return coalesce(new, old);
end;
$$;

create trigger memory_audit
  after update or delete on public.memory
  for each row execute function public.memory_audit_trigger();
*/
