-- v2 Migration 006: Voice sessions + voice session turns
-- Tracks Parrott's time in voice channels for analytics and context.
-- Idempotent. Depends on 001.

create table if not exists public.voice_sessions (
    id          uuid        primary key default gen_random_uuid(),
    created_at  timestamptz not null    default now(),
    ended_at    timestamptz,
    guild_id    text        not null,
    channel_id  text        not null,
    trigger     text,                          -- 'command' | 'activity' | 'hang_out' etc.
    triggered_by_user_id text,
    duration_seconds integer
      generated always as (
        extract(epoch from (ended_at - created_at))::integer
      ) stored
);
create index if not exists idx_voice_sessions_guild_channel on public.voice_sessions(guild_id, channel_id, created_at desc);
create index if not exists idx_voice_sessions_created_at   on public.voice_sessions(created_at desc);
comment on table public.voice_sessions is
  'One row per voice channel visit by Parrott. ended_at set on disconnect.';

alter table public.voice_sessions enable row level security;
drop policy if exists "Authenticated users can read voice_sessions" on public.voice_sessions;
create policy "Authenticated users can read voice_sessions"
  on public.voice_sessions for select to authenticated using (true);

-- ── voice_session_turns ───────────────────────────────────────────────────────
create table if not exists public.voice_session_turns (
    id               uuid        primary key default gen_random_uuid(),
    created_at       timestamptz not null    default now(),
    session_id       uuid        not null    references public.voice_sessions(id) on delete cascade,
    speaker_user_id  text,                   -- null = Parrott spoke
    utterance_text   text        not null,
    parrott_response text,                   -- null if speaker was Parrott
    tool_calls       text[]      not null    default '{}'
);
create index if not exists idx_voice_session_turns_session on public.voice_session_turns(session_id, created_at);
comment on table public.voice_session_turns is
  'Transcript of a single voice session. One row per utterance (user or Parrott).';

alter table public.voice_session_turns enable row level security;
drop policy if exists "Authenticated users can read voice_session_turns" on public.voice_session_turns;
create policy "Authenticated users can read voice_session_turns"
  on public.voice_session_turns for select to authenticated using (true);
