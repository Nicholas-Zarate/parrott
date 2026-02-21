-- TTS response ending (postfix) and trigger probability. Agent appends ending to voice TTS when probability allows.
-- value_text = ending string (empty = do not append); value_int = percent 0-100.

insert into public.parrot_runtime_config (key, value_text, value_int, updated_at)
values
  ('tts_ending', ' SQUACK NINJAS', null, now()),
  ('tts_ending_probability', null, 100, now())
on conflict (key) do nothing;

comment on table public.parrot_runtime_config is 'Runtime config (model, voice_model, token limits, tts_ending, tts_ending_probability). Fetched at startup when using Supabase for prompt config.';
