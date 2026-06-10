-- v2 Migration 007: User DM preferences
-- Per-user opt-out for activity trigger DMs.
-- Idempotent. Depends on 001.

create table if not exists public.user_dm_preferences (
    id                  uuid        primary key default gen_random_uuid(),
    created_at          timestamptz not null    default now(),
    updated_at          timestamptz not null    default now(),
    user_id             text        not null    unique,  -- Discord user ID
    receive_activity_dms boolean    not null    default true,
    receive_timer_dms   boolean     not null    default true,
    receive_announcement_dms boolean not null   default false
);
create index if not exists idx_user_dm_preferences_user_id on public.user_dm_preferences(user_id);
comment on table public.user_dm_preferences is
  'Per Discord user opt-in/out preferences for DMs. Defaults: activity DMs on, announcement DMs off.
   Written when a user uses /parrott dm-settings or clicks a preference button.';

alter table public.user_dm_preferences enable row level security;
drop policy if exists "Authenticated users can read all dm preferences" on public.user_dm_preferences;
create policy "Authenticated users can read all dm preferences"
  on public.user_dm_preferences for select to authenticated using (true);
drop policy if exists "Service role can upsert dm preferences" on public.user_dm_preferences;
create policy "Service role can upsert dm preferences"
  on public.user_dm_preferences for all to authenticated
  using     (true)
  with check (true);
