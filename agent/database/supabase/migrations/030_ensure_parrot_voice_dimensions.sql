-- Ensure parrot_voice_dimensions exists and is seeded (fixes "table not in schema cache").
-- Safe to run multiple times. Uses same defaults as client DEFAULT_DIMENSIONS (snarky 70, chill 30, witty 80, sarcastic 60, sassy 75).

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

insert into public.parrot_voice_dimensions (scope, snarky, chill, witty, sarcastic, sassy)
values
    ('global', 70, 30, 80, 60, 75),
    ('tools', 70, 30, 80, 60, 75)
on conflict (scope) do update set
    snarky = excluded.snarky,
    chill = excluded.chill,
    witty = excluded.witty,
    sarcastic = excluded.sarcastic,
    sassy = excluded.sassy,
    updated_at = now();

alter table public.parrot_voice_dimensions enable row level security;

drop policy if exists "Anon can read parrot_voice_dimensions" on public.parrot_voice_dimensions;
create policy "Anon can read parrot_voice_dimensions"
  on public.parrot_voice_dimensions for select to anon using (true);

drop policy if exists "Authenticated can read parrot_voice_dimensions" on public.parrot_voice_dimensions;
create policy "Authenticated can read parrot_voice_dimensions"
  on public.parrot_voice_dimensions for select to authenticated using (true);

-- Write policies: use can_write_settings() if it exists (migration 007). If not, run 007 first or these will fail.
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on p.pronamespace = n.oid where n.nspname = 'private' and p.proname = 'can_write_settings') then
    drop policy if exists "Authenticated can write parrot_voice_dimensions" on public.parrot_voice_dimensions;
    drop policy if exists "Admins and editors can insert parrot_voice_dimensions" on public.parrot_voice_dimensions;
    create policy "Admins and editors can insert parrot_voice_dimensions"
      on public.parrot_voice_dimensions for insert to authenticated with check ((select private.can_write_settings()));
    drop policy if exists "Admins and editors can update parrot_voice_dimensions" on public.parrot_voice_dimensions;
    create policy "Admins and editors can update parrot_voice_dimensions"
      on public.parrot_voice_dimensions for update to authenticated using ((select private.can_write_settings()));
    drop policy if exists "Admins and editors can delete parrot_voice_dimensions" on public.parrot_voice_dimensions;
    create policy "Admins and editors can delete parrot_voice_dimensions"
      on public.parrot_voice_dimensions for delete to authenticated using ((select private.can_write_settings()));
  else
    -- Fallback: allow any authenticated user to write (restrict later with migration 007)
    drop policy if exists "Authenticated can write parrot_voice_dimensions" on public.parrot_voice_dimensions;
    create policy "Authenticated can write parrot_voice_dimensions"
      on public.parrot_voice_dimensions for all to authenticated using (true) with check (true);
  end if;
end
$$;
