-- Make is_parrott_admin() join robust: compare as trimmed text so type or
-- whitespace in auth.identities.provider_id cannot break the match.
-- Fixes Owner (Discord in parrott_admin_discord_ids) still getting "forbidden"
-- when updating parrot_tones.
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
    join public.parrott_admin_discord_ids a
      on trim(a.discord_id::text) = trim(coalesce(i.provider_id::text, ''))
    where i.user_id = auth.uid()
      and i.provider = 'discord'
  );
$$;

comment on function private.is_parrott_admin() is 'Returns true if the current authenticated user is a Parrott admin (by Discord identity in parrott_admin_discord_ids).';
