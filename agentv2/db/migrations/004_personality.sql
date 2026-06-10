-- v2 Migration 004: Personality tables — parrot_tones, parrot_prompt_sections,
--   parrot_runtime_config, parrot_voice_dimensions, parrot_roast_config
-- Idempotent. Depends on 001.

-- ── parrot_tones ──────────────────────────────────────────────────────────────
create table if not exists public.parrot_tones (
    id         uuid        primary key default gen_random_uuid(),
    created_at timestamptz not null    default now(),
    updated_at timestamptz not null    default now(),
    role       text        not null    unique,  -- 'default' | custom names
    voice      text,                            -- tone for voice chat
    text       text,                            -- tone for text chat
    vc         text                             -- vc-specific tone override
);
comment on table public.parrot_tones is
  'Named tone profiles. role=default is the active fallback.';

alter table public.parrot_tones enable row level security;
drop policy if exists "Authenticated users can read parrot_tones" on public.parrot_tones;
create policy "Authenticated users can read parrot_tones"
  on public.parrot_tones for select to authenticated using (true);
drop policy if exists "Editors can write parrot_tones" on public.parrot_tones;
create policy "Editors can write parrot_tones"
  on public.parrot_tones for all to authenticated
  using     ((select private.can_write_settings()))
  with check ((select private.can_write_settings()));

-- Seed — final v1 tones (from migration 001 / bootstrap_parrot_tones)
insert into public.parrot_tones (role, voice, text, vc) values
(
  'default',
  'You are Parrott, a loud, unhinged AI in the crew''s Discord voice channel. You are a pirate who loves chaos, but also cares about the crew. You roast mercilessly but always show up when it matters.',
  'You are Parrott, a chaotic yet loyal AI who lives in the Discord server. You''re a pirate with a big mouth, sarcastic humor, and genuine love for the crew. Keep it short. Keep it real.',
  'You are Parrott. It''s the voice channel. You hear everything. You say things out loud whether they''re welcome or not. Keep it punchy — you''re interrupting, not presenting.'
)
on conflict (role) do update set
  voice      = excluded.voice,
  text       = excluded.text,
  vc         = excluded.vc,
  updated_at = now();

-- ── parrot_prompt_sections ────────────────────────────────────────────────────
create table if not exists public.parrot_prompt_sections (
    id         uuid        primary key default gen_random_uuid(),
    created_at timestamptz not null    default now(),
    updated_at timestamptz not null    default now(),
    key        text        not null    unique,  -- e.g. 'tools', 'rules', 'voice_rules'
    label      text        not null,
    content    text        not null,
    enabled    boolean     not null    default true,
    sort_order integer     not null    default 0
);
comment on table public.parrot_prompt_sections is
  'Named prompt sections injected into the agent system prompt in sort_order.';

alter table public.parrot_prompt_sections enable row level security;
drop policy if exists "Authenticated users can read parrot_prompt_sections" on public.parrot_prompt_sections;
create policy "Authenticated users can read parrot_prompt_sections"
  on public.parrot_prompt_sections for select to authenticated using (true);
drop policy if exists "Editors can write parrot_prompt_sections" on public.parrot_prompt_sections;
create policy "Editors can write parrot_prompt_sections"
  on public.parrot_prompt_sections for all to authenticated
  using     ((select private.can_write_settings()))
  with check ((select private.can_write_settings()));

-- Seed — v2 tools section (updated tool list, Model Router IDs, v2 capabilities)
insert into public.parrot_prompt_sections (key, label, content, enabled, sort_order) values
(
  'tools',
  'Tools & Capabilities',
  E'## Tools available to you\n\n'
  '- **search_web** — search the internet for information, news, game updates, anything the crew asks about\n'
  '- **create_timer** — set a countdown timer with a message; Parrott will announce when it fires\n'
  '- **run_roast** — roast a specific crew member. Be savage but keep it crew-level (not cruel). Only use when explicitly asked or the moment demands it\n'
  '- **sing_song** — generate and perform an original song. Use sparingly; pick your moments\n'
  '- **join_voice_and_squawk** — join the voice channel and say something out loud\n'
  '- **hang_out_in_voice** — stay in voice channel idle, listening\n\n'
  '## Rules for tool use\n\n'
  '- Don''t announce that you''re calling a tool. Just do it and respond naturally\n'
  '- Don''t apologize for what tools can or can''t do\n'
  '- If a tool fails, improvise — stay in character\n'
  '- Tools marked disabled in tools_meta_data are not callable; don''t reference them\n',
  true,
  10
)
on conflict (key) do update set
  label      = excluded.label,
  content    = excluded.content,
  enabled    = excluded.enabled,
  sort_order = excluded.sort_order,
  updated_at = now();

-- ── parrot_runtime_config ─────────────────────────────────────────────────────
create table if not exists public.parrot_runtime_config (
    id          uuid        primary key default gen_random_uuid(),
    created_at  timestamptz not null    default now(),
    updated_at  timestamptz not null    default now(),
    key         text        not null    unique,
    value       text        not null,
    description text,
    value_type  text        not null    default 'string' check (value_type in ('string','number','boolean','json'))
);
comment on table public.parrot_runtime_config is
  'Key-value runtime config readable at startup. Keys are stable; values are editable without redeploy.';

alter table public.parrot_runtime_config enable row level security;
drop policy if exists "Authenticated users can read parrot_runtime_config" on public.parrot_runtime_config;
create policy "Authenticated users can read parrot_runtime_config"
  on public.parrot_runtime_config for select to authenticated using (true);
drop policy if exists "Editors can write parrot_runtime_config" on public.parrot_runtime_config;
create policy "Editors can write parrot_runtime_config"
  on public.parrot_runtime_config for all to authenticated
  using     ((select private.can_write_settings()))
  with check ((select private.can_write_settings()));

-- Seed — v2 runtime config (full Model Router IDs)
insert into public.parrot_runtime_config (key, value, description, value_type) values
  ('model',               'openai/gpt-4o',          'Primary chat model (Model Router full ID)',            'string'),
  ('voice_model',         'openai/gpt-4o-mini',     'Voice reply model — faster/cheaper for VC (Model Router full ID)', 'string'),
  ('embedding_model',     'openai/text-embedding-3-small', 'Embedding model for semantic recall',           'string'),
  ('max_tokens',          '800',                    'Max tokens per reply',                                'number'),
  ('temperature',         '0.9',                    'Temperature for personality (higher = wilder)',        'number'),
  ('last_messages',       '20',                     'How many recent messages Mastra injects per turn',    'number'),
  ('semantic_top_k',      '5',                      'How many semantically similar past messages to recall', 'number'),
  ('activity_channel',    'activity',               'Default channel name for activity trigger messages',  'string'),
  ('bot_name',            'Parrott',                'Display name; used in greetings and self-reference',  'string'),
  ('announce_channel',    'announcements',          'Channel name for periodic announcements',             'string')
on conflict (key) do update set
  value      = excluded.value,
  description= excluded.description,
  value_type = excluded.value_type,
  updated_at = now();

-- ── parrot_voice_dimensions ───────────────────────────────────────────────────
create table if not exists public.parrot_voice_dimensions (
    id          uuid        primary key default gen_random_uuid(),
    created_at  timestamptz not null    default now(),
    updated_at  timestamptz not null    default now(),
    scope       text        not null    check (scope in ('global','tools','channel_type','persona')),
    dimension   text        not null,
    value       text        not null,
    description text,
    sort_order  integer     not null    default 0,
    unique (scope, dimension)
);
comment on table public.parrot_voice_dimensions is
  'Voice dimension rules injected into the TTS/voice prompt per scope.';

alter table public.parrot_voice_dimensions enable row level security;
drop policy if exists "Authenticated users can read parrot_voice_dimensions" on public.parrot_voice_dimensions;
create policy "Authenticated users can read parrot_voice_dimensions"
  on public.parrot_voice_dimensions for select to authenticated using (true);
drop policy if exists "Editors can write parrot_voice_dimensions" on public.parrot_voice_dimensions;
create policy "Editors can write parrot_voice_dimensions"
  on public.parrot_voice_dimensions for all to authenticated
  using     ((select private.can_write_settings()))
  with check ((select private.can_write_settings()));

-- Seed — global + tools dimensions from v1
insert into public.parrot_voice_dimensions (scope, dimension, value, description, sort_order) values
  ('global', 'speed',    'fast',           'Slightly faster than normal speech pace',                      10),
  ('global', 'pitch',    'natural',        'No unnatural pitch adjustment',                               20),
  ('global', 'energy',   'high',           'Energetic, punchy delivery',                                  30),
  ('global', 'pauses',   'short',          'Minimal pauses — Parrott does not wait around',               40),
  ('tools',  'tone',     'confident',      'When using tools, sound decisive — no hedging',               10),
  ('tools',  'delivery', 'direct',         'Skip filler words around tool results',                       20)
on conflict (scope, dimension) do update set
  value      = excluded.value,
  description= excluded.description,
  sort_order = excluded.sort_order,
  updated_at = now();

-- ── parrot_roast_config ───────────────────────────────────────────────────────
create table if not exists public.parrot_roast_config (
    id             uuid        primary key default gen_random_uuid(),
    created_at     timestamptz not null    default now(),
    updated_at     timestamptz not null    default now(),
    key            text        not null    unique,
    value          text        not null,
    description    text,
    value_type     text        not null    default 'string'
);
comment on table public.parrot_roast_config is
  'Config for the run_roast tool — intensity caps, forbidden topics, etc.';

alter table public.parrot_roast_config enable row level security;
drop policy if exists "Authenticated users can read parrot_roast_config" on public.parrot_roast_config;
create policy "Authenticated users can read parrot_roast_config"
  on public.parrot_roast_config for select to authenticated using (true);
drop policy if exists "Editors can write parrot_roast_config" on public.parrot_roast_config;
create policy "Editors can write parrot_roast_config"
  on public.parrot_roast_config for all to authenticated
  using     ((select private.can_write_settings()))
  with check ((select private.can_write_settings()));

-- Seed — default roast config
insert into public.parrot_roast_config (key, value, description, value_type) values
  ('intensity_max',   '8',      'Max roast intensity on a 1-10 scale (10 = full destruction)',  'number'),
  ('cooldown_minutes','5',      'Minimum minutes between roasts of the same person',             'number'),
  ('forbidden_topics','[]',     'JSON array of topics to never roast about',                     'json'),
  ('auto_roast_prob', '0.05',   'Probability (0-1) Parrott spontaneously roasts in VC',         'number')
on conflict (key) do update set
  value      = excluded.value,
  description= excluded.description,
  value_type = excluded.value_type,
  updated_at = now();
