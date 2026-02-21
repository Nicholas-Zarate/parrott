-- Voice session and turns for "hang out in VC" + STT recording.
-- Bot inserts via service role; client read-only for future UI.

create table if not exists public.voice_sessions (
    id uuid primary key default gen_random_uuid(),
    guild_id text not null,
    channel_id text not null,
    text_channel_id text,
    started_at timestamptz not null default now(),
    ended_at timestamptz,
    created_at timestamptz not null default now()
);

comment on table public.voice_sessions is 'One row per voice "hang out" session; ended_at set when bot leaves or session ends.';
comment on column public.voice_sessions.channel_id is 'Discord voice channel ID.';
comment on column public.voice_sessions.text_channel_id is 'Text channel for confirmations and introspection output (from the message that started the session).';

create index if not exists idx_voice_sessions_guild_id on public.voice_sessions(guild_id);
create index if not exists idx_voice_sessions_ended_at on public.voice_sessions(ended_at) where ended_at is null;

create table if not exists public.voice_session_turns (
    id uuid primary key default gen_random_uuid(),
    session_id uuid not null references public.voice_sessions(id) on delete cascade,
    speaker text not null check (speaker in ('user', 'bot')),
    content text not null,
    created_at timestamptz not null default now()
);

comment on table public.voice_session_turns is 'One row per user utterance and per bot reply in a voice session (transcript + future memory hook).';

create index if not exists idx_voice_session_turns_session_id on public.voice_session_turns(session_id);

alter table public.voice_sessions enable row level security;
alter table public.voice_session_turns enable row level security;

create policy "Anon can read voice_sessions" on public.voice_sessions for select to anon using (true);
create policy "Authenticated can read voice_sessions" on public.voice_sessions for select to authenticated using (true);

create policy "Anon can read voice_session_turns" on public.voice_session_turns for select to anon using (true);
create policy "Authenticated can read voice_session_turns" on public.voice_session_turns for select to authenticated using (true);
