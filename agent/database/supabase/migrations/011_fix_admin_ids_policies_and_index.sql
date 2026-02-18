-- Fix 1: Replace ALL policy on parrott_admin_discord_ids with per-command policies
-- to eliminate duplicate permissive SELECT evaluation.
drop policy if exists "Admins can manage admin list" on public.parrott_admin_discord_ids;

create policy "Admins can insert admin ids"
  on public.parrott_admin_discord_ids
  for insert
  to authenticated
  with check ((select private.is_parrott_admin()));

create policy "Admins can update admin ids"
  on public.parrott_admin_discord_ids
  for update
  to authenticated
  using ((select private.is_parrott_admin()));

create policy "Admins can delete admin ids"
  on public.parrott_admin_discord_ids
  for delete
  to authenticated
  using ((select private.is_parrott_admin()));

-- Fix 2: Add missing index on parrott_app_roles.granted_by foreign key
create index if not exists idx_parrott_app_roles_granted_by
  on public.parrott_app_roles (granted_by);
