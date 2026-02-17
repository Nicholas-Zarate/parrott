-- Allow admins and editors to update parrot_tones (e.g. is_active, description).
-- Required for Personality UI: enable/disable media tones, edit description.
create policy "Admins and editors can update parrot_tones"
  on public.parrot_tones
  for update
  to authenticated
  using ((select private.can_write_settings()));
