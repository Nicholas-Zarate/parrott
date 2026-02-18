-- Allow unauthenticated (anon) users to read announcements for public read-only home view.
create policy "Anon can read announcements"
  on public.parrot_announcements
  for select
  to anon
  using (true);
