-- v2 Migration 005: tools_meta_data — canonical tool registry + v2 tool seeds
-- Replaces v1's parrot_tool_descriptions. Table name is final.
-- Idempotent. Depends on 001.

create table if not exists public.tools_meta_data (
    id                    uuid        primary key default gen_random_uuid(),
    created_at            timestamptz not null    default now(),
    updated_at            timestamptz not null    default now(),
    tool_slug             text        not null    unique,
    description           text        not null,
    example_command       text,
    example_trigger_phrases jsonb     not null    default '[]',
    is_active             boolean     not null    default true,
    response_delivery     text        not null    default 'text' check (response_delivery in ('text','voice','both'))
);
comment on table public.tools_meta_data is
  'Registry of all Parrott tools. is_active=false means the tool is disabled at runtime.
   tool_slug matches the function name registered with Mastra.
   response_delivery: how results are surfaced to the user.';

create index if not exists idx_tools_meta_data_slug   on public.tools_meta_data(tool_slug);
create index if not exists idx_tools_meta_data_active on public.tools_meta_data(is_active) where is_active = true;

alter table public.tools_meta_data enable row level security;

drop policy if exists "Authenticated users can read tools_meta_data" on public.tools_meta_data;
create policy "Authenticated users can read tools_meta_data"
  on public.tools_meta_data for select to authenticated using (true);

drop policy if exists "Editors can update tools_meta_data" on public.tools_meta_data;
create policy "Editors can update tools_meta_data"
  on public.tools_meta_data for update to authenticated
  using     ((select private.can_write_settings()))
  with check ((select private.can_write_settings()));

drop policy if exists "Admins can insert tools_meta_data" on public.tools_meta_data;
create policy "Admins can insert tools_meta_data"
  on public.tools_meta_data for insert to authenticated
  with check ((select private.is_parrott_admin()));

drop policy if exists "Admins can delete tools_meta_data" on public.tools_meta_data;
create policy "Admins can delete tools_meta_data"
  on public.tools_meta_data for delete to authenticated
  using ((select private.is_parrott_admin()));

-- ── Seed — v2 tool set ────────────────────────────────────────────────────────
-- Active tools
insert into public.tools_meta_data
  (tool_slug, description, example_command, example_trigger_phrases, is_active, response_delivery)
values
(
  'search_web',
  'Searches the internet for current information. Use for news, game updates, anything the crew asks that Parrott wouldn''t know from training.',
  '@Parrott what''s the latest Elden Ring patch?',
  '["what''s the latest", "look that up", "google that", "search for", "find out", "what happened with"]'::jsonb,
  true,
  'text'
),
(
  'create_timer',
  'Sets a countdown timer. When it fires, Parrott announces it in the channel.',
  '@Parrott set a 10 minute timer for the pizza',
  '["set a timer", "remind me in", "countdown", "ping me in", "timer for"]'::jsonb,
  true,
  'text'
),
(
  'run_roast',
  'Generates and delivers a roast of a specific crew member. Savage but crew-level — not cruel. Only fires when asked or the moment demands it.',
  '@Parrott roast Danny',
  '["roast", "destroy", "go off on", "talk about", "clown on", "make fun of"]'::jsonb,
  true,
  'both'
),
(
  'sing_song',
  'Composes and performs an original song. Parrott picks the genre and theme. Use sparingly.',
  '@Parrott sing a song about our raid last night',
  '["sing", "make a song", "write a song", "rap about", "drop a verse", "song about"]'::jsonb,
  true,
  'voice'
),
(
  'join_voice_and_squawk',
  'Joins the active voice channel and delivers a message out loud. Leaves after speaking.',
  '@Parrott hop in voice and roast Tyler',
  '["join voice", "hop in", "get in vc", "come in voice", "say it out loud"]'::jsonb,
  true,
  'voice'
),
(
  'hang_out_in_voice',
  'Joins the voice channel and stays idle — listening, potentially chiming in. Useful for presence.',
  '@Parrott hang out with us',
  '["hang out", "chill in voice", "stay in vc", "listen in", "lurk with us"]'::jsonb,
  true,
  'voice'
),
-- Disabled — planned, not yet implemented
(
  'make_joke_like',
  'Generates a joke in the style of a specific comedian or crew member. Disabled until v3.',
  '@Parrott tell a joke like Norm McDonald',
  '["joke like", "in the style of", "impersonate", "do a bit like"]'::jsonb,
  false,
  'text'
)
on conflict (tool_slug) do update set
  description             = excluded.description,
  example_command         = excluded.example_command,
  example_trigger_phrases = excluded.example_trigger_phrases,
  is_active               = excluded.is_active,
  response_delivery       = excluded.response_delivery,
  updated_at              = now();
