-- Require the model to call hang_out_in_voice for "hang out in voice" (no one-liner reply).
-- Fixes: user says "hang out in voice" but model replied "I'm on my way!" and handler TTS'd that one-shot (join then leave).

-- Tool description: reinforce MUST call, do not one-liner
update public.tools_meta_data
set
  description = 'Join the user''s voice channel and stay there, starting listening (speech-to-text). Use when the user says: hang out in voice, hang out in voice chat, join and stay in VC, come hang in voice, stay in voice. You MUST call this tool—do not reply with a one-liner like "on my way" instead. They must be in a voice channel. Call with no parameters.',
  updated_at = now()
where tool_slug = 'hang_out_in_voice';

update public.parrot_prompt_sections
set
  content = replace(
    content,
    'hang_out_in_voice (when the user says hang out in voice, hang out in voice chat, join and stay in VC, or similar—call hang_out_in_voice; they must be in a voice channel). start_listening',
    'hang_out_in_voice (when the user says hang out in voice, hang out in voice chat, join and stay in VC, or similar, you MUST call hang_out_in_voice—do not reply with a one-liner like "on my way" or "be right there" instead; always call the tool. They must be in a voice channel.). start_listening'
  ),
  updated_at = now()
where slug = 'tools';
