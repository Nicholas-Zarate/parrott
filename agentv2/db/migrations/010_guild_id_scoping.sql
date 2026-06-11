-- v2 Migration 010: guild_id scoping for multi-tenancy
--
-- Adds guild_id to the 5 global config tables so each Discord server
-- (guild) can have its own personality, flags, and runtime config.
--
-- Non-breaking: all existing rows receive guild_id = 'default'.
-- Queries use "guild-specific OR fallback to 'default'" in application code.
-- Idempotent.

-- ── parrot_tones ──────────────────────────────────────────────────────────────

alter table public.parrot_tones
  add column if not exists guild_id text not null default 'default';

-- Drop old single-column unique; replace with composite
alter table public.parrot_tones
  drop constraint if exists parrot_tones_role_key;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'parrot_tones_guild_role_key'
  ) then
    alter table public.parrot_tones
      add constraint parrot_tones_guild_role_key unique (guild_id, role);
  end if;
end $$;

create index if not exists idx_parrot_tones_guild_id on public.parrot_tones(guild_id);

-- ── parrot_prompt_sections ────────────────────────────────────────────────────

alter table public.parrot_prompt_sections
  add column if not exists guild_id text not null default 'default';

alter table public.parrot_prompt_sections
  drop constraint if exists parrot_prompt_sections_key_key;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'parrot_prompt_sections_guild_key_key'
  ) then
    alter table public.parrot_prompt_sections
      add constraint parrot_prompt_sections_guild_key_key unique (guild_id, key);
  end if;
end $$;

create index if not exists idx_parrot_prompt_sections_guild_id on public.parrot_prompt_sections(guild_id);

-- ── parrot_runtime_config ─────────────────────────────────────────────────────

alter table public.parrot_runtime_config
  add column if not exists guild_id text not null default 'default';

alter table public.parrot_runtime_config
  drop constraint if exists parrot_runtime_config_key_key;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'parrot_runtime_config_guild_key_key'
  ) then
    alter table public.parrot_runtime_config
      add constraint parrot_runtime_config_guild_key_key unique (guild_id, key);
  end if;
end $$;

create index if not exists idx_parrot_runtime_config_guild_id on public.parrot_runtime_config(guild_id);

-- ── parrot_feature_flags ──────────────────────────────────────────────────────
-- Was: primary key on (key). Becomes: primary key on (guild_id, key).

alter table public.parrot_feature_flags
  add column if not exists guild_id text not null default 'default';

-- Only drop + recreate PK when guild_id isn't already in it
do $$ begin
  if not exists (
    select 1 from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
    where c.conname = 'parrot_feature_flags_pkey'
      and a.attname = 'guild_id'
  ) then
    alter table public.parrot_feature_flags drop constraint if exists parrot_feature_flags_pkey;
    alter table public.parrot_feature_flags add primary key (guild_id, key);
  end if;
end $$;

create index if not exists idx_parrot_feature_flags_guild_id on public.parrot_feature_flags(guild_id);

-- ── tools_meta_data ───────────────────────────────────────────────────────────

alter table public.tools_meta_data
  add column if not exists guild_id text not null default 'default';

alter table public.tools_meta_data
  drop constraint if exists tools_meta_data_tool_slug_key;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tools_meta_data_guild_slug_key'
  ) then
    alter table public.tools_meta_data
      add constraint tools_meta_data_guild_slug_key unique (guild_id, tool_slug);
  end if;
end $$;

create index if not exists idx_tools_meta_data_guild_id on public.tools_meta_data(guild_id);
