-- Phase 3: App roles table + refine write policies for editors

-- 1. App roles table
create table if not exists public.parrott_app_roles (
    user_id uuid references auth.users(id) on delete cascade primary key,
    role text not null check (role in ('admin', 'editor', 'viewer')),
    granted_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now()
);

comment on table public.parrott_app_roles is 'App-level roles (admin/editor/viewer) for Parrott UI permissions. Only admins can manage.';

-- 2. RLS on parrott_app_roles
alter table public.parrott_app_roles enable row level security;

-- Anyone authenticated can see roles
create policy "Authenticated users can read app roles"
  on public.parrott_app_roles
  for select
  to authenticated
  using (true);

-- Only bootstrap admins can manage roles
create policy "Admins can insert app roles"
  on public.parrott_app_roles
  for insert
  to authenticated
  with check ((select private.is_parrott_admin()));

create policy "Admins can update app roles"
  on public.parrott_app_roles
  for update
  to authenticated
  using ((select private.is_parrott_admin()));

create policy "Admins can delete app roles"
  on public.parrott_app_roles
  for delete
  to authenticated
  using ((select private.is_parrott_admin()));

-- 3. Helper function: can current user write settings? (admin by discord OR app role admin/editor)
create or replace function private.can_write_settings()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.is_parrott_admin())
      or exists (
           select 1 from public.parrott_app_roles
           where user_id = auth.uid()
             and role in ('admin', 'editor')
         );
$$;

comment on function private.can_write_settings() is 'Returns true if the current user is a bootstrap admin or has admin/editor app role.';

-- 4. Replace activity_trigger_settings write policies to allow editors too
drop policy if exists "Admins can insert activity_trigger_settings" on public.activity_trigger_settings;
drop policy if exists "Admins can update activity_trigger_settings" on public.activity_trigger_settings;
drop policy if exists "Admins can delete activity_trigger_settings" on public.activity_trigger_settings;

create policy "Admins and editors can insert activity_trigger_settings"
  on public.activity_trigger_settings
  for insert
  to authenticated
  with check ((select private.can_write_settings()));

create policy "Admins and editors can update activity_trigger_settings"
  on public.activity_trigger_settings
  for update
  to authenticated
  using ((select private.can_write_settings()));

create policy "Admins and editors can delete activity_trigger_settings"
  on public.activity_trigger_settings
  for delete
  to authenticated
  using ((select private.can_write_settings()));

-- 5. Lightweight profiles view so admin can see who has logged in
create or replace view public.parrott_user_profiles as
select
  u.id as user_id,
  u.raw_user_meta_data ->> 'full_name' as display_name,
  u.raw_user_meta_data ->> 'avatar_url' as avatar_url,
  u.raw_user_meta_data ->> 'preferred_username' as username,
  u.email,
  u.created_at,
  u.last_sign_in_at,
  i.provider_id as discord_id
from auth.users u
left join auth.identities i on i.user_id = u.id and i.provider = 'discord';

comment on view public.parrott_user_profiles is 'Read-only view of auth.users for display in the Team page. Only accessible by authenticated users.';

grant select on public.parrott_user_profiles to authenticated;
