-- Allow admins (bootstrap or app role admin) to update parrot_runtime_config so the Model UI can change the model.
-- SELECT remains for anon and authenticated; this adds UPDATE for admins only.

drop policy if exists "Admins can update parrot_runtime_config" on public.parrot_runtime_config;
create policy "Admins can update parrot_runtime_config"
  on public.parrot_runtime_config
  for update
  to authenticated
  using (
    (select private.is_parrott_admin())
    or exists (
      select 1 from public.parrott_app_roles
      where user_id = auth.uid() and role = 'admin'
    )
  )
  with check (
    (select private.is_parrott_admin())
    or exists (
      select 1 from public.parrott_app_roles
      where user_id = auth.uid() and role = 'admin'
    )
  );
