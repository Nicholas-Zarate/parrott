-- Per-guild, per-trigger activity settings (delivery toggles, enabled, cooldown, optional config).
-- guild_id NULL = app-wide default. Resolution: guild row > app-default row > file config.
create table if not exists activity_trigger_settings (
    id uuid primary key default gen_random_uuid(),
    guild_id text,
    trigger_type text not null,
    deliver_channel boolean not null default true,
    deliver_dm boolean not null default true,
    deliver_voice boolean not null default true,
    enabled boolean not null default true,
    cooldown_minutes integer not null default 90,
    channel_name_override text,
    config jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (guild_id, trigger_type)
);

create index if not exists idx_activity_trigger_settings_guild_trigger
    on activity_trigger_settings (guild_id, trigger_type);
create index if not exists idx_activity_trigger_settings_app_default
    on activity_trigger_settings (trigger_type) where guild_id is null;

comment on table activity_trigger_settings is 'Per-trigger (and optionally per-guild) delivery and behavior: channel/DM/voice toggles, enabled, cooldown. NULL guild_id = app default.';
comment on column activity_trigger_settings.channel_name_override is 'If set, use this channel name for this trigger instead of the global activity channel.';
