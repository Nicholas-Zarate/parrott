-- make_joke_like tool: when user says "make a joke like <subject>", look up comedy skits/jokes and speak one in VC.
-- See .cursor/rules/parrott-new-tools.mdc.

insert into public.parrot_tool_descriptions (tool_slug, description, is_active, updated_at)
values (
  'make_joke_like',
  'When the user says "make a joke like <subject>" (e.g. a comedian name or style like "dad jokes"), call this tool with that subject. The bot will search for comedy skits/jokes for that subject, pick one joke, speak it in the user''s voice channel via TTS, and return the joke. Requester must be in a voice channel. Do not use for generic "tell me a joke" unless they say "like" something; for "make a joke like X" use this tool.',
  true,
  now()
)
on conflict (tool_slug) do update set description = excluded.description, updated_at = now();
