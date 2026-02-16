-- Runtime config: model id and token limits. Agent uses when PARROT_TONES_SOURCE=supabase.
-- Fallback: env or hardcoded in config/parrot.js.

create table if not exists public.parrot_runtime_config (
    id uuid primary key default gen_random_uuid(),
    key text not null unique check (char_length(trim(key)) > 0),
    value_text text,
    value_int int,
    updated_at timestamptz not null default now()
);

create index if not exists idx_parrot_runtime_config_key on public.parrot_runtime_config(key);

comment on table public.parrot_runtime_config is 'Runtime config (model, token limits). Fetched at startup when using Supabase for prompt config.';

-- Seed default row(s). Use key-value so we can add more keys later.
insert into public.parrot_runtime_config (key, value_text, value_int, updated_at) values
('model', 'gpt-4o', null, now()),
('max_completion_tokens', null, 150, now()),
('max_prompt_tokens', null, 1000, now())
on conflict (key) do update set value_text = excluded.value_text, value_int = excluded.value_int, updated_at = now();

-- RLS
alter table public.parrot_runtime_config enable row level security;

drop policy if exists "Anon can read parrot_runtime_config" on public.parrot_runtime_config;
create policy "Anon can read parrot_runtime_config" on public.parrot_runtime_config for select to anon using (true);

drop policy if exists "Authenticated can read parrot_runtime_config" on public.parrot_runtime_config;
create policy "Authenticated can read parrot_runtime_config" on public.parrot_runtime_config for select to authenticated using (true);
