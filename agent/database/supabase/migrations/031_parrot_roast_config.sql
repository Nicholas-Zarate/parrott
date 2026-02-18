-- Roast type weights and game-streak threshold. Agent and Personality UI read/update.
-- Weights (messages / game_streak / custom) must sum to 100; enforced in UI and agent.

create table if not exists public.parrot_roast_config (
    id uuid primary key default gen_random_uuid(),
    key text not null unique check (char_length(trim(key)) > 0),
    value_int int,
    value_jsonb jsonb,
    updated_at timestamptz not null default now()
);

create index if not exists idx_parrot_roast_config_key on public.parrot_roast_config(key);

comment on table public.parrot_roast_config is 'Roast type weights (messages, game_streak, custom) and game_streak_min_activities. Fetched at startup with other personality config.';

-- Seed defaults: 60% messages, 10% game_streak, 30% custom; min activities for game_streak = 5
insert into public.parrot_roast_config (key, value_int, updated_at) values
('roast_weight_messages', 60, now()),
('roast_weight_game_streak', 10, now()),
('roast_weight_custom', 30, now()),
('roast_game_streak_min_activities', 5, now())
on conflict (key) do update set value_int = excluded.value_int, updated_at = now();

-- RLS: read for anon and authenticated; update for admins only (same as parrot_runtime_config)
alter table public.parrot_roast_config enable row level security;

drop policy if exists "Anon can read parrot_roast_config" on public.parrot_roast_config;
create policy "Anon can read parrot_roast_config"
  on public.parrot_roast_config for select to anon using (true);

drop policy if exists "Authenticated can read parrot_roast_config" on public.parrot_roast_config;
create policy "Authenticated can read parrot_roast_config"
  on public.parrot_roast_config for select to authenticated using (true);

drop policy if exists "Admins can update parrot_roast_config" on public.parrot_roast_config;
create policy "Admins can update parrot_roast_config"
  on public.parrot_roast_config
  for update to authenticated
  using (
    (select private.is_parrott_admin())
    or exists (select 1 from public.parrott_app_roles where user_id = auth.uid() and role = 'admin')
  )
  with check (
    (select private.is_parrott_admin())
    or exists (select 1 from public.parrott_app_roles where user_id = auth.uid() and role = 'admin')
  );

-- Allow insert so UI can upsert by key if row missing (optional; agent only reads)
drop policy if exists "Admins can insert parrot_roast_config" on public.parrot_roast_config;
create policy "Admins can insert parrot_roast_config"
  on public.parrot_roast_config
  for insert to authenticated
  with check (
    (select private.is_parrott_admin())
    or exists (select 1 from public.parrott_app_roles where user_id = auth.uid() and role = 'admin')
  );
