-- Allow authenticated users to insert into logs only for db_audit entries (client-side audit logging).
-- Agent continues to use service role; this policy is for the Next.js app when user is signed in.
create policy "Authenticated can insert db_audit logs"
  on public.logs
  for insert
  to authenticated
  with check (
    (meta is not null and (meta->>'type') = 'db_audit')
  );
