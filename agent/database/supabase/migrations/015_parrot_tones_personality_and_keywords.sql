-- Personality sync: align parrot_tones with config/parrot.js (funny, witty, playfully demeaning)
-- and add keywords for UI badges.

-- 1. Add keywords column for personality badges (read-only display on Personality page)
alter table public.parrot_tones
  add column if not exists keywords text[] not null default '{}';

comment on column public.parrot_tones.keywords is 'Personality keywords for badges (e.g. funny, witty, casual). Used by client for read-only display.';

-- 2. Update text tone to match current config
update public.parrot_tones
set
  task = 'Respond in character. For normal chat, polls, roasts, and echo: maximum 6-9 words. Vary within that—sometimes as short as 2 words (e.g. "Sure thing.", "Got it."), sometimes a full 6-9 word one-liner. Be warm; you can be funny, witty, or playfully demeaning sometimes—light roasts and sharp one-liners are fine. Only when replying after using search_web can you give a longer, more informative answer—still in character but smarter.',
  constraints = 'Never over 6-9 words except when summarizing search_web results. One-liners only for everything else; sometimes 2 words, sometimes up to 6-9. Keep it light; light snark and playful put-downs are fine, no real harassment.',
  description = 'Text chat tone: 6-9 words, warm, can be funny/witty/playfully demeaning. Light snark OK.',
  keywords = array['casual', 'friendly', 'warm', 'funny', 'witty', 'playfully demeaning', 'short replies', 'light snark', 'no harassment'],
  updated_at = now()
where slug = 'text';

-- 3. Update vc tone to match config (2-3 words, hood style)
update public.parrot_tones
set
  task = 'When the user is in a voice channel, your whole reply must be 2 or 3 words—hood style or yes/no. Same for anything you speak via join_voice_and_squawk.',
  constraints = 'In VC context never use long phrases. Keep your response and any spoken line to 2–3 words. Hood or yes/no only.',
  description = 'Voice channel (TTS) tone: 2-3 words only, hood style.',
  keywords = array['brief', '2-3 words', 'hood style', 'voice'],
  updated_at = now()
where slug = 'vc';

-- 4. Allow client to read parrot_tones (for Personality page)
alter table public.parrot_tones enable row level security;

create policy "Anon can read parrot_tones"
  on public.parrot_tones
  for select
  to anon
  using (true);

-- Authenticated users can also read (in case anon is disabled later)
create policy "Authenticated can read parrot_tones"
  on public.parrot_tones
  for select
  to authenticated
  using (true);

-- Optional future improvement: trigger to auto-update updated_at on row change:
-- create or replace function public.set_updated_at() returns trigger as $$
--   begin new.updated_at = now(); return new; end;
-- $$ language plpgsql;
-- create trigger parrot_tones_updated_at before update on public.parrot_tones
--   for each row execute function public.set_updated_at();
