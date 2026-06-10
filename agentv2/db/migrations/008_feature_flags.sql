-- v2 Migration 008: parrot_feature_flags — runtime feature gate table + seeds
-- A flag is active only when enabled=true AND status='live'.
-- Idempotent. Depends on 001.

create table if not exists public.parrot_feature_flags (
    key         text        primary key,
    label       text        not null,
    category    text        not null    check (category in ('memory','voice','activity','personality','tools','infra')),
    enabled     boolean     not null    default false,
    status      text        not null    default 'planned' check (status in ('planned','dev','beta','live','deprecated')),
    description text,
    updated_at  timestamptz not null    default now()
);
comment on table public.parrot_feature_flags is
  'Runtime feature gates. Active = enabled=true AND status=''live''.
   Toggle enabled in the dashboard without redeploy. status reflects build progress.';

alter table public.parrot_feature_flags enable row level security;
drop policy if exists "Authenticated users can read feature flags" on public.parrot_feature_flags;
create policy "Authenticated users can read feature flags"
  on public.parrot_feature_flags for select to authenticated using (true);
drop policy if exists "Editors can update feature flags" on public.parrot_feature_flags;
create policy "Editors can update feature flags"
  on public.parrot_feature_flags for update to authenticated
  using     ((select private.can_write_settings()))
  with check ((select private.can_write_settings()));
drop policy if exists "Admins can insert feature flags" on public.parrot_feature_flags;
create policy "Admins can insert feature flags"
  on public.parrot_feature_flags for insert to authenticated
  with check ((select private.is_parrott_admin()));

-- ── Seed — 10 v2 feature flags ────────────────────────────────────────────────
-- All seeded as 'planned'; promote to 'dev'→'beta'→'live' + flip enabled as built.
insert into public.parrot_feature_flags (key, label, category, enabled, status, description, updated_at)
values
  ('capability.memory',
   'Memory (working + semantic recall)',
   'memory',
   false,
   'planned',
   'Mastra two-store memory: per-user working memory + semantic recall on every turn.',
   now()),

  ('capability.voice',
   'Voice channel (STT → LLM → TTS)',
   'voice',
   false,
   'planned',
   'Parrott joins voice channels, listens (Whisper STT), responds (LLM), and speaks (ElevenLabs TTS).',
   now()),

  ('capability.activity_triggers',
   'Activity triggers',
   'activity',
   false,
   'planned',
   'Presence/voice-state events fire contextual messages: game_start, go_live, comeback, etc.',
   now()),

  ('capability.mention_reply',
   '@mention reply',
   'personality',
   false,
   'planned',
   'Parrott responds to @mentions with full agent loop + memory + tools.',
   now()),

  ('capability.slash_commands',
   'Slash commands',
   'tools',
   false,
   'planned',
   'Registered Discord slash commands (e.g. /roast, /timer).',
   now()),

  ('capability.channel_allowlist',
   'Channel allowlist (G2)',
   'infra',
   false,
   'planned',
   'Restrict which channels Parrott responds in. Tier system: unlimited/semi/limited.',
   now()),

  ('capability.dm_delivery',
   'DM delivery for activity triggers',
   'activity',
   false,
   'planned',
   'Activity trigger messages delivered to user DMs respecting user_dm_preferences.',
   now()),

  ('tool.search_web',
   'Tool: search_web',
   'tools',
   false,
   'planned',
   'Web search tool. Enabled separately from other tools to control cost.',
   now()),

  ('tool.sing_song',
   'Tool: sing_song',
   'tools',
   false,
   'planned',
   'Song generation + voice delivery tool.',
   now()),

  ('tool.run_roast',
   'Tool: run_roast',
   'tools',
   false,
   'planned',
   'Roast tool. Toggle off if roasts are getting out of hand.',
   now())

on conflict (key) do update set
  label       = excluded.label,
  category    = excluded.category,
  description = excluded.description,
  updated_at  = excluded.updated_at;
  -- Note: enabled and status are NOT updated on conflict — preserve dashboard edits
