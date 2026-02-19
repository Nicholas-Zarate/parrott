-- Allow admins and editors to update tools_meta_data (e.g. example_trigger_phrases, description, is_active).
-- Required for Personality UI: edit trigger phrases and other tool meta.
create policy "Admins and editors can update tools_meta_data"
  on public.tools_meta_data
  for update
  to authenticated
  using ((select private.can_write_settings()));
