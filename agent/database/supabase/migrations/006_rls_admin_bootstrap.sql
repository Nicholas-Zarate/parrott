-- Phase 2: RLS + admin bootstrap

-- 1. Create private schema for internal functions
create schema if not exists private;

-- 2. Admin allowlist table (bootstrap: your Discord user ID)
create table if not exists public.parrott_admin_discord_ids (
    discord_id text primary key,
    note text,
    created_at timestamptz not null default now()
);

comment on table public.parrott_admin_discord_ids is 'Allowlist of Discord user IDs that are Parrott admins. Rows here grant full write access via RLS.';

-- Bootstrap: swim (swim_xs1)
insert into public.parrott_admin_discord_ids (discord_id, note)
values ('774794604394053632', 'swim (swim_xs1) — bootstrap admin')
on conflict (discord_id) do nothing;

-- 3. Security definer function: is current auth user in admin allowlist?
create or replace function private.is_parrott_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.identities i
    join public.parrott_admin_discord_ids a on a.discord_id = i.provider_id
    where i.user_id = auth.uid()
      and i.provider = 'discord'
  );
$$;

comment on function private.is_parrott_admin() is 'Returns true if the current authenticated user is a Parrott admin (by Discord identity in parrott_admin_discord_ids).';

-- 4. RLS on activity_trigger_settings
alter table public.activity_trigger_settings enable row level security;

-- SELECT: any authenticated user can read
create policy "Authenticated users can read activity_trigger_settings"
  on public.activity_trigger_settings
  for select
  to authenticated
  using (true);

-- INSERT: admin only
create policy "Admins can insert activity_trigger_settings"
  on public.activity_trigger_settings
  for insert
  to authenticated
  with check ((select private.is_parrott_admin()));

-- UPDATE: admin only
create policy "Admins can update activity_trigger_settings"
  on public.activity_trigger_settings
  for update
  to authenticated
  using ((select private.is_parrott_admin()));

-- DELETE: admin only
create policy "Admins can delete activity_trigger_settings"
  on public.activity_trigger_settings
  for delete
  to authenticated
  using ((select private.is_parrott_admin()));

-- 5. RLS on activity_listeners (read-only for authenticated)
alter table public.activity_listeners enable row level security;

create policy "Authenticated users can read activity_listeners"
  on public.activity_listeners
  for select
  to authenticated
  using (true);

-- Agent writes via service role, so no INSERT/UPDATE/DELETE policy needed for authenticated.

-- 6. RLS on parrott_admin_discord_ids (admin-only management, read for authenticated)
alter table public.parrott_admin_discord_ids enable row level security;

create policy "Authenticated users can read admin list"
  on public.parrott_admin_discord_ids
  for select
  to authenticated
  using (true);

create policy "Admins can manage admin list"
  on public.parrott_admin_discord_ids
  for all
  to authenticated
  using ((select private.is_parrott_admin()))
  with check ((select private.is_parrott_admin()));

-- 7. RLS on logs (read-only for authenticated)
alter table public.logs enable row level security;

create policy "Authenticated users can read logs"
  on public.logs
  for select
  to authenticated
  using (true);

-- 8. RLS on parrot_conversation_history (read-only for authenticated)
alter table public.parrot_conversation_history enable row level security;

create policy "Authenticated users can read conversation history"
  on public.parrot_conversation_history
  for select
  to authenticated
  using (true);

-- 9. RLS on parrot_announcements (read-only for authenticated)
alter table public.parrot_announcements enable row level security;

create policy "Authenticated users can read announcements"
  on public.parrot_announcements
  for select
  to authenticated
  using (true);
