-- Voice style dimensions (0-100 sliders) for Role & Voice overlay.
-- scope = 'global' → injected after Voice block; scope = 'tools' → after tools section.
-- Agent and client use this table; RLS allows admins/editors to write.

create table if not exists public.parrot_voice_dimensions (
    scope text primary key,
    snarky smallint not null check (snarky >= 0 and snarky <= 100),
    chill smallint not null check (chill >= 0 and chill <= 100),
    witty smallint not null check (witty >= 0 and witty <= 100),
    sarcastic smallint not null check (sarcastic >= 0 and sarcastic <= 100),
    sassy smallint not null check (sassy >= 0 and sassy <= 100),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

comment on table public.parrot_voice_dimensions is 'Per-scope voice trait weights (0-100). global = after Voice block; tools = after tools section.';

-- Seed default rows
insert into public.parrot_voice_dimensions (scope, snarky, chill, witty, sarcastic, sassy)
values
    ('global', 70, 30, 80, 60, 75),
    ('tools', 70, 30, 80, 60, 75)
on conflict (scope) do nothing;

-- RLS: anon and authenticated can read (client + agent via service role)
alter table public.parrot_voice_dimensions enable row level security;

create policy "Anon can read parrot_voice_dimensions"
  on public.parrot_voice_dimensions
  for select
  to anon
  using (true);

create policy "Authenticated can read parrot_voice_dimensions"
  on public.parrot_voice_dimensions
  for select
  to authenticated
  using (true);

-- Admins and editors can insert/update (same pattern as activity_trigger_settings)
create policy "Admins and editors can insert parrot_voice_dimensions"
  on public.parrot_voice_dimensions
  for insert
  to authenticated
  with check ((select private.can_write_settings()));

create policy "Admins and editors can update parrot_voice_dimensions"
  on public.parrot_voice_dimensions
  for update
  to authenticated
  using ((select private.can_write_settings()));

create policy "Admins and editors can delete parrot_voice_dimensions"
  on public.parrot_voice_dimensions
  for delete
  to authenticated
  using ((select private.can_write_settings()));
