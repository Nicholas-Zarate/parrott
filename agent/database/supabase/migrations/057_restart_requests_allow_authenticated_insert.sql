-- Allow any authenticated user to insert (we set user_id in app code).
-- Fixes RLS rejection when auth.uid() doesn't match in Route Handler context.
drop policy if exists "Authenticated can insert restart_requests" on public.restart_requests;
create policy "Authenticated can insert restart_requests"
    on public.restart_requests
    for insert
    to authenticated
    with check (true);
