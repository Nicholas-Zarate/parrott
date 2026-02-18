-- Agent logs: error, warn, info, debug with timestamps.
-- Written by agent/supabase/logs.js (and optionally via patched console).
create table if not exists logs (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    level text not null,
    message text not null,
    meta jsonb
);

create index if not exists idx_logs_created_at on logs(created_at desc);
create index if not exists idx_logs_level_created_at on logs(level, created_at desc);

comment on table logs is 'Agent console logs (error, warn, info, debug) with timestamps; written by supabase/logs.js.';
comment on column logs.level is 'Log level: error, warn, info, or debug.';
comment on column logs.message is 'Log message text.';
comment on column logs.meta is 'Optional JSON context (e.g. stack, guild_id).';
