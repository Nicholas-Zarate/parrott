-- Add user_name to activity_listeners so we store who triggered the activity (display name at event time).
-- Table may already exist from a previous setup; we only add the column if missing.
alter table if exists activity_listeners
    add column if not exists user_name text;

-- Comment only when column exists (safe when table was missing and ALTER no-op'd).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'activity_listeners' and column_name = 'user_name'
  ) then
    execute 'comment on column activity_listeners.user_name is ''Display name (or username) of the user who triggered the activity at event time.''';
  end if;
end $$;
