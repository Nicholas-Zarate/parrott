-- Stronger prompt: when user says "sing" + song, model MUST call sing_song (no one-liner instead).
-- Injects the rule into the tools section after the existing sing_song clause.
update public.parrot_prompt_sections
set
  content = replace(
    content,
    '). make_joke_like (when the user says "make a joke like',
    '). When the user says sing followed by a song name or artist - song, you MUST call sing_song with that as songQuery; do not reply with a one-liner instead; always call the tool. After the tool returns, confirm briefly in character. make_joke_like (when the user says "make a joke like'
  ),
  updated_at = now()
where slug = 'tools';
