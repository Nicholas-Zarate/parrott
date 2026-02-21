-- Restart requests: web app inserts; agent consumes and posts to Discord (voice or #parrot).
create table if not exists restart_requests (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    guild_id text,
    target text not null check (target in ('voice', 'parrot')),
    message text not null,
    status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
    user_id uuid
);

create index if not exists idx_restart_requests_status_created
    on restart_requests (status, created_at desc);

alter table restart_requests enable row level security;

-- Authenticated users may insert (user_id can be null or their own id).
create policy "Authenticated can insert restart_requests"
    on public.restart_requests
    for insert
    to authenticated
    with check (
        user_id is null or user_id = auth.uid()
    );

-- Service role (agent) needs select and update; anon/authenticated do not.
-- No policy for select/update by authenticated; agent uses service role key which bypasses RLS.

comment on table restart_requests is 'Restart requests from the web app; agent polls and sends to Discord (overseer role) in voice or #parrot channel.';
