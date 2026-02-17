-- Seed app-default rows (guild_id IS NULL) for all trigger types so the agent and client
-- can rely on Supabase only (no file fallback). Values match previous config/activity.js.
-- One app-default row per trigger_type: use partial unique index so ON CONFLICT works (NULLs are distinct in main unique).
create unique index if not exists idx_activity_trigger_settings_app_default_unique
    on public.activity_trigger_settings (trigger_type) where guild_id is null;

insert into public.activity_trigger_settings (
    guild_id,
    trigger_type,
    deliver_channel,
    deliver_dm,
    deliver_voice,
    enabled,
    cooldown_minutes,
    channel_name_override,
    config,
    updated_at
)
values
    (null, 'game_start',   true, true, true, true, 90,  null, '{}'::jsonb, now()),
    (null, 'late_night',   true, true, true, true, 360, null, '{"startHour":0,"endHour":5}'::jsonb, now()),
    (null, 'long_session', true, true, true, true, 360, null, '{"thresholdMinutes":180}'::jsonb, now()),
    (null, 'group_gaming', true, true, true, true, 240, null, '{"minPlayers":3}'::jsonb, now()),
    (null, 'streaming',    true, true, true, true, 60,  null, '{}'::jsonb, now()),
    (null, 'go_live',      true, true, true, true, 60,  null, '{}'::jsonb, now()),
    (null, 'comeback',     true, true, true, true, 1440, null, '{"absenceMinutes":1440}'::jsonb, now())
on conflict (trigger_type) do update set
    deliver_channel = excluded.deliver_channel,
    deliver_dm = excluded.deliver_dm,
    deliver_voice = excluded.deliver_voice,
    enabled = excluded.enabled,
    cooldown_minutes = excluded.cooldown_minutes,
    config = excluded.config,
    updated_at = excluded.updated_at;

comment on table public.activity_trigger_settings is 'Per-trigger (and optionally per-guild) delivery and behavior. App defaults (guild_id NULL) are seeded here; agent uses DB only.';
