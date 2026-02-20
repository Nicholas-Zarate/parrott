-- Add voice_model key to parrot_runtime_config for voice chat LLM (lower latency).
-- Same table, key-value; FE can read/update via existing RLS. Seed default gpt-4o-mini.

insert into public.parrot_runtime_config (key, value_text, value_int, updated_at)
values ('voice_model', 'gpt-4o-mini', null, now())
on conflict (key) do update set
  value_text = excluded.value_text,
  updated_at = now();

comment on table public.parrot_runtime_config is 'Runtime config (model, voice_model, token limits). Fetched at startup when using Supabase for prompt config.';
