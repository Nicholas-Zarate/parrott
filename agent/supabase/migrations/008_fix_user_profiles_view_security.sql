-- Fix security advisories on parrott_user_profiles view

-- 1. Revoke anon access (only authenticated should see user profiles)
revoke all on public.parrott_user_profiles from anon;

-- 2. Recreate view with security_invoker to avoid security definer warning.
-- Since auth.users is not accessible to authenticated role directly,
-- we wrap the query in a security definer FUNCTION instead (controlled access).
drop view if exists public.parrott_user_profiles;

-- Create a security definer function in private schema (not exposed via PostgREST API)
create or replace function private.get_user_profiles()
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  username text,
  email text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  discord_id text
)
language sql
stable
security definer
set search_path = ''
as $$
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
$$;

comment on function private.get_user_profiles() is 'Returns user profile data from auth.users. Security definer in private schema (not exposed to API).';

-- Recreate view as security invoker, backed by the private function
create or replace view public.parrott_user_profiles
with (security_invoker = true)
as
select * from private.get_user_profiles();

-- Grant to authenticated only (not anon)
revoke all on public.parrott_user_profiles from anon;
grant select on public.parrott_user_profiles to authenticated;
