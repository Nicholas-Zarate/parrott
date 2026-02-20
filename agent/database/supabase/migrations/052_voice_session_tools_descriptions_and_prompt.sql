-- Voice session tools: add hang_out_in_voice, start_listening, stop_listening to tools_meta_data and tools prompt section.

-- 1. Insert into tools_meta_data (response_delivery both so voice is used when user is in VC)
insert into public.tools_meta_data (tool_slug, description, is_active, response_delivery, example_trigger_phrases, updated_at)
values
  (
    'hang_out_in_voice',
    'Join the user''s voice channel and stay there, starting listening (speech-to-text). Use when the user says: hang out in voice, hang out in voice chat, join and stay in VC, come hang in voice, stay in voice, etc. They must be in a voice channel. Call with no parameters.',
    true,
    'both',
    '["hang out in voice", "hang out in voice chat", "join and stay in VC", "come hang in voice"]'::jsonb,
    now()
  ),
  (
    'start_listening',
    'Turn listening (speech-to-text) on for the current voice session. Use when the user says start listening and you are already in their voice channel. Call with no parameters. If you are not in a VC, the tool will return an error—tell them to ask you to hang out first.',
    true,
    'both',
    '["start listening", "start listening again", "listen"]'::jsonb,
    now()
  ),
  (
    'stop_listening',
    'Turn listening (speech-to-text) off for the current voice session. Use when the user says stop listening and you are in their voice channel. You stay in VC but stop transcribing until they say start listening. Call with no parameters.',
    true,
    'both',
    '["stop listening", "stop listening for a bit", "pause listening"]'::jsonb,
    now()
  )
on conflict (tool_slug) do update set
  description = excluded.description,
  is_active = excluded.is_active,
  response_delivery = excluded.response_delivery,
  example_trigger_phrases = excluded.example_trigger_phrases,
  updated_at = now();

-- 2. Add voice session tools to the tools prompt section (after join_voice_and_squawk, before echo)
update public.parrot_prompt_sections
set
  content = replace(
    content,
    'Do NOT use for echo; use echo tool for "echo" or "repeat".), echo (only for',
    'Do NOT use for echo; use echo tool for "echo" or "repeat".). hang_out_in_voice (when the user says hang out in voice, hang out in voice chat, join and stay in VC, or similar—call hang_out_in_voice; they must be in a voice channel). start_listening (when they say start listening and you are already in their VC—call start_listening). stop_listening (when they say stop listening and you are in their VC—call stop_listening). echo (only for'
  ),
  updated_at = now()
where slug = 'tools';
