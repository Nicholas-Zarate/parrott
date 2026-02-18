-- Public RPC functions so the client can check permissions server-side.
-- These wrap the private security-definer functions.

create or replace function public.check_permissions()
returns json
language sql
stable
security invoker
set search_path = ''
as $$
  select json_build_object(
    'is_admin', (select private.is_parrott_admin()),
    'can_edit', (select private.can_write_settings())
  );
$$;

comment on function public.check_permissions() is 'Returns {is_admin, can_edit} for the current authenticated user. Used by the client UI.';

grant execute on function public.check_permissions() to authenticated;
revoke execute on function public.check_permissions() from anon;
