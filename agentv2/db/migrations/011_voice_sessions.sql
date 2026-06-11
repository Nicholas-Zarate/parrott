-- v2 Migration 011: add v2 columns to existing v1 voice tables
--
-- voice_sessions and voice_session_turns already exist from v1.
-- This migration adds v2-specific columns only (non-breaking).
--
-- Column mapping (v1 name → used as in v2 code):
--   voice_sessions:      created_at=started_at, ended_at, guild_id, channel_id
--   voice_session_turns: speaker_user_id=user_id, utterance_text=user_text,
--                        parrott_response=response_text, tool_calls=tools_called

alter table public.voice_sessions
  add column if not exists end_reason text; -- 'disconnect' | 'leave_command' | 'shutdown'

alter table public.voice_session_turns
  add column if not exists guild_id        text,
  add column if not exists channel_id      text,
  add column if not exists interrupted     boolean not null default false,
  add column if not exists first_audio_ms  integer;

create index if not exists idx_voice_sessions_guild_id      on public.voice_sessions(guild_id);
create index if not exists idx_voice_sessions_started_at    on public.voice_sessions(created_at desc);
create index if not exists idx_voice_session_turns_session_id on public.voice_session_turns(session_id);
create index if not exists idx_voice_session_turns_guild_id  on public.voice_session_turns(guild_id);
