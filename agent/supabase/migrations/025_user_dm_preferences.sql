-- User preference: allow or opt out of activity/timer DMs from the parrot.
-- Agent reads by discord_id (service role); client uses user_id for RLS.

create table if not exists public.user_dm_preferences (
    user_id uuid not null references auth.users(id) on delete cascade primary key,
    discord_id text not null unique,
    allow_activity_dm boolean not null default true,
    updated_at timestamptz not null default now()
);

comment on table public.user_dm_preferences is 'Per-user opt-out of activity and timer DMs. Agent looks up by discord_id; client manages by user_id.';

create index if not exists idx_user_dm_preferences_discord_id
    on public.user_dm_preferences (discord_id);

alter table public.user_dm_preferences enable row level security;

create policy "Users can read own DM preferences"
    on public.user_dm_preferences for select
    to authenticated
    using (user_id = auth.uid());

create policy "Users can insert own DM preferences"
    on public.user_dm_preferences for insert
    to authenticated
    with check (user_id = auth.uid());

create policy "Users can update own DM preferences"
    on public.user_dm_preferences for update
    to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());
