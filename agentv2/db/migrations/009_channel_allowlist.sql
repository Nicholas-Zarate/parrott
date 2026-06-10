-- v2 Migration 009: parrot_channel_allowlist — G2 channel tier system
-- Controls which channels Parrott responds in and at what rate.
-- Idempotent. Depends on 001.

create table if not exists public.parrot_channel_allowlist (
    id         uuid        primary key default gen_random_uuid(),
    created_at timestamptz not null    default now(),
    updated_at timestamptz not null    default now(),
    channel_id text        not null,
    guild_id   text        not null,
    tier       text        not null    default 'semi' check (tier in ('unlimited','semi','limited')),
    is_active  boolean     not null    default true,
    label      text,                   -- friendly name for dashboard display
    unique (channel_id, guild_id)
);
create index if not exists idx_channel_allowlist_guild       on public.parrot_channel_allowlist(guild_id, is_active);
create index if not exists idx_channel_allowlist_channel_guild on public.parrot_channel_allowlist(channel_id, guild_id);

comment on table public.parrot_channel_allowlist is
  'Allowlist of channels Parrott responds in. When empty (no rows) OR when capability.channel_allowlist flag is off,
   Parrott responds everywhere. Tier controls response rate:
     unlimited — always respond (main bot channel, general)
     semi      — respond most of the time (gaming channels)
     limited   — occasional / activity-only responses (archive, off-topic)';

comment on column public.parrot_channel_allowlist.tier is
  'unlimited: respond freely. semi: ~80% of mentions, reduced noise. limited: activity triggers only, no @mention reply.';

alter table public.parrot_channel_allowlist enable row level security;
drop policy if exists "Authenticated users can read channel_allowlist" on public.parrot_channel_allowlist;
create policy "Authenticated users can read channel_allowlist"
  on public.parrot_channel_allowlist for select to authenticated using (true);
drop policy if exists "Editors can insert channel_allowlist" on public.parrot_channel_allowlist;
create policy "Editors can insert channel_allowlist"
  on public.parrot_channel_allowlist for insert to authenticated
  with check ((select private.can_write_settings()));
drop policy if exists "Editors can update channel_allowlist" on public.parrot_channel_allowlist;
create policy "Editors can update channel_allowlist"
  on public.parrot_channel_allowlist for update to authenticated
  using     ((select private.can_write_settings()))
  with check ((select private.can_write_settings()));
drop policy if exists "Editors can delete channel_allowlist" on public.parrot_channel_allowlist;
create policy "Editors can delete channel_allowlist"
  on public.parrot_channel_allowlist for delete to authenticated
  using ((select private.can_write_settings()));

-- No seed rows — allowlist is empty at launch (feature flag is 'planned').
-- Add channels via the dashboard once feature flag is promoted to 'live'.
