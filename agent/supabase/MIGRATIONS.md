# Applying migrations to remote Supabase

**`supabase db push` does not delete or reset your remote database.** It only runs migration files that have not yet been applied (recorded in `supabase_migrations.schema_migrations` on the remote). Existing data and already-applied migrations are left as-is.

## Recommended: CLI (from agent directory)

Migrations live under `agent/supabase/migrations/`, so run the CLI from `agent/`:

1. **Link the project** (once per machine):

   ```bash
   cd agent
   npx supabase login
   npx supabase link --project-ref <PROJECT_REF>
   ```

   Get `<PROJECT_REF>` from the dashboard URL: `https://supabase.com/dashboard/project/<PROJECT_REF>`.
   You may be prompted for the database password.

2. **Push pending migrations**:

   ```bash
   cd agent
   npx supabase db push
   ```

   Only migrations not already applied on the remote will run. To see what would run without applying: `npx supabase db push --dry-run`.

If you get **"project not linked"** or **"could not connect"**, run step 1 again from `agent/`. If you use a separate DB URL (e.g. self-hosted), see `npx supabase db push --help` for `--db-url`.

## Alternative: Run SQL manually in Dashboard

If the CLI fails or you prefer not to use it:

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project → **SQL Editor**.
2. Open `agent/supabase/migrations/037_make_joke_like_tool_description.sql`, copy its contents, paste into the editor, run.
3. Open `agent/supabase/migrations/038_tools_section_make_joke_like.sql`, copy its contents, paste, run.

This applies only those two migrations. The CLI migration history on the remote will not be updated, so a future `db push` might try to run 037 and 038 again. If that happens, use `supabase migration repair` to mark them as applied, or continue using the Dashboard for one-off updates.
