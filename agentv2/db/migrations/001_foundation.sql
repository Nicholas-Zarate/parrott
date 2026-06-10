-- v2 Migration 001: Foundation — private schema, admin bootstrap, app roles, RLS helpers
-- Idempotent. Run once on a fresh project.
-- NOTE: Functions must be created before policies that reference them.

-- ── Private schema ────────────────────────────────────────────────────────────
create schema if not exists private;

-- ── Admin allowlist (table + seed first — function body references this table) ──
create table if not exists public.parrott_admin_discord_ids (
    discord_id text primary key,
    note       text,
    created_at timestamptz not null default now()
);
comment on table public.parrott_admin_discord_ids is
  'Allowlist of Discord user IDs that are Parrott admins. Rows here grant full write access via RLS.';

insert into public.parrott_admin_discord_ids (discord_id, note)
values ('774794604394053632', 'swim (swim_xs1) — bootstrap admin')
on conflict (discord_id) do nothing;

-- ── is_parrott_admin() — must exist before any policy uses it ─────────────────
create or replace function private.is_parrott_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from auth.identities i
    join public.parrott_admin_discord_ids a on a.discord_id = i.provider_id
    where i.user_id = auth.uid() and i.provider = 'discord'
  );
$$;
comment on function private.is_parrott_admin() is
  'Returns true if the current authenticated user is a Parrott admin (by Discord identity).';

-- ── RLS + policies on admin table (now that the function exists) ──────────────
alter table public.parrott_admin_discord_ids enable row level security;
drop policy if exists "Authenticated users can read admin list" on public.parrott_admin_discord_ids;
create policy "Authenticated users can read admin list"
  on public.parrott_admin_discord_ids for select to authenticated using (true);
drop policy if exists "Admins can manage admin list" on public.parrott_admin_discord_ids;
create policy "Admins can manage admin list"
  on public.parrott_admin_discord_ids for all to authenticated
  using     ((select private.is_parrott_admin()))
  with check ((select private.is_parrott_admin()));

-- ── App roles ─────────────────────────────────────────────────────────────────
create table if not exists public.parrott_app_roles (
    user_id    uuid references auth.users(id) on delete cascade primary key,
    role       text not null check (role in ('admin', 'editor', 'viewer')),
    granted_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now()
);
comment on table public.parrott_app_roles is
  'App-level roles (admin/editor/viewer) for Parrott UI permissions.';

alter table public.parrott_app_roles enable row level security;
drop policy if exists "Authenticated users can read app roles" on public.parrott_app_roles;
create policy "Authenticated users can read app roles"
  on public.parrott_app_roles for select to authenticated using (true);
drop policy if exists "Admins can insert app roles" on public.parrott_app_roles;
create policy "Admins can insert app roles"
  on public.parrott_app_roles for insert to authenticated
  with check ((select private.is_parrott_admin()));
drop policy if exists "Admins can update app roles" on public.parrott_app_roles;
create policy "Admins can update app roles"
  on public.parrott_app_roles for update to authenticated
  using ((select private.is_parrott_admin()));
drop policy if exists "Admins can delete app roles" on public.parrott_app_roles;
create policy "Admins can delete app roles"
  on public.parrott_app_roles for delete to authenticated
  using ((select private.is_parrott_admin()));

-- ── can_write_settings() ─────────────────────────────────────────────────────
create or replace function private.can_write_settings()
returns boolean language sql stable security definer set search_path = ''
as $$
  select (select private.is_parrott_admin())
      or exists (
           select 1 from public.parrott_app_roles
           where user_id = auth.uid() and role in ('admin', 'editor')
         );
$$;
comment on function private.can_write_settings() is
  'Returns true if the current user is a bootstrap admin or has admin/editor app role.';

-- ── User profiles view ────────────────────────────────────────────────────────
create or replace view public.parrott_user_profiles as
select
  u.id               as user_id,
  u.raw_user_meta_data ->> 'full_name'           as display_name,
  u.raw_user_meta_data ->> 'avatar_url'           as avatar_url,
  u.raw_user_meta_data ->> 'preferred_username'   as username,
  u.email,
  u.created_at,
  u.last_sign_in_at,
  i.provider_id      as discord_id
from auth.users u
left join auth.identities i on i.user_id = u.id and i.provider = 'discord';
comment on view public.parrott_user_profiles is
  'Read-only view of auth.users for display in the Team page.';
grant select on public.parrott_user_profiles to authenticated;
