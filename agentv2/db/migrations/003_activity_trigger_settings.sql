-- v2 Migration 003: Activity trigger settings + seeds (7 trigger types)
-- Idempotent. Depends on 001.

create table if not exists public.activity_trigger_settings (
    id                   uuid        primary key default gen_random_uuid(),
    guild_id             text,
    trigger_type         text        not null,
    deliver_channel      boolean     not null    default true,
    deliver_dm           boolean     not null    default true,
    deliver_voice        boolean     not null    default true,
    enabled              boolean     not null    default true,
    cooldown_minutes     integer     not null    default 90,
    channel_name_override text,
    config               jsonb,
    created_at           timestamptz not null    default now(),
    updated_at           timestamptz not null    default now(),
    unique (guild_id, trigger_type)
);
create index if not exists idx_activity_trigger_settings_guild_trigger
  on public.activity_trigger_settings(guild_id, trigger_type);
create unique index if not exists idx_activity_trigger_settings_app_default_unique
  on public.activity_trigger_settings(trigger_type) where guild_id is null;

comment on table  public.activity_trigger_settings is
  'Per-trigger delivery settings. NULL guild_id = app default. Resolution: guild row > app default.';
comment on column public.activity_trigger_settings.channel_name_override is
  'If set, use this channel name for this trigger instead of the global activity channel.';

alter table public.activity_trigger_settings enable row level security;
drop policy if exists "Authenticated users can read activity_trigger_settings" on public.activity_trigger_settings;
create policy "Authenticated users can read activity_trigger_settings"
  on public.activity_trigger_settings for select to authenticated using (true);
drop policy if exists "Admins and editors can insert activity_trigger_settings" on public.activity_trigger_settings;
create policy "Admins and editors can insert activity_trigger_settings"
  on public.activity_trigger_settings for insert to authenticated
  with check ((select private.can_write_settings()));
drop policy if exists "Admins and editors can update activity_trigger_settings" on public.activity_trigger_settings;
create policy "Admins and editors can update activity_trigger_settings"
  on public.activity_trigger_settings for update to authenticated
  using ((select private.can_write_settings()));
drop policy if exists "Admins and editors can delete activity_trigger_settings" on public.activity_trigger_settings;
create policy "Admins and editors can delete activity_trigger_settings"
  on public.activity_trigger_settings for delete to authenticated
  using ((select private.can_write_settings()));

-- ── Seed: app-default rows (guild_id IS NULL) for all 7 trigger types ─────────
insert into public.activity_trigger_settings
  (guild_id, trigger_type, deliver_channel, deliver_dm, deliver_voice, enabled, cooldown_minutes, channel_name_override, config, updated_at)
values
  (null, 'game_start',   true, true, true, true,  90,   null, '{}'::jsonb,                              now()),
  (null, 'late_night',   true, true, true, true,  360,  null, '{"startHour":0,"endHour":5}'::jsonb,     now()),
  (null, 'long_session', true, true, true, true,  360,  null, '{"thresholdMinutes":180}'::jsonb,        now()),
  (null, 'group_gaming', true, true, true, true,  240,  null, '{"minPlayers":3}'::jsonb,                now()),
  (null, 'streaming',    true, true, true, true,  60,   null, '{}'::jsonb,                              now()),
  (null, 'go_live',      true, true, true, true,  60,   null, '{}'::jsonb,                              now()),
  (null, 'comeback',     true, true, true, true,  1440, null, '{"absenceMinutes":1440}'::jsonb,         now())
on conflict (trigger_type) where guild_id is null do update set
  deliver_channel  = excluded.deliver_channel,
  deliver_dm       = excluded.deliver_dm,
  deliver_voice    = excluded.deliver_voice,
  enabled          = excluded.enabled,
  cooldown_minutes = excluded.cooldown_minutes,
  config           = excluded.config,
  updated_at       = excluded.updated_at;
