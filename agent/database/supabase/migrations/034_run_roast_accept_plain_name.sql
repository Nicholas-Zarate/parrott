-- run_roast can take either a Discord user ID (from @mention) or a plain name (no lookup).
-- When the user says "roast Harol" with no @mention, pass targetUserName only (e.g. "Harol").

update public.parrot_tool_descriptions
set
  description = 'Generate a short roast. Two modes: (1) With @mention: when the user says "roast @Someone", pass that user''s Discord ID as targetUserId (use the mentioned user''s id from the message). (2) Plain name: when the user says "roast Harol" (no @mention), pass only targetUserName (e.g. "Harol"); do not try to resolve to a Discord user—roast the name as plain text. Uses last 7 days and server scope for user-ID roasts. For a roast in voice chat or in VC: call run_roast first to get the roast text, then call join_voice_and_squawk with that roast as customMessage (the person requesting must be in a voice channel).',
  updated_at = now()
where tool_slug = 'run_roast';
