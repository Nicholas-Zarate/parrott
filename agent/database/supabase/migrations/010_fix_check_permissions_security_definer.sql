-- Fix: check_permissions must be SECURITY DEFINER to access private schema functions.
-- auth.uid() still returns the correct user inside security definer (reads from JWT context).
create or replace function public.check_permissions()
returns json
language sql
stable
security definer
set search_path = ''
as $$
  select json_build_object(
    'is_admin', (select private.is_parrott_admin()),
    'can_edit', (select private.can_write_settings())
  );
$$;
