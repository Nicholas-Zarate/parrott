-- Backfill example_trigger_phrases (jsonb) from codebase context.
-- Only updates existing rows; missing rows (e.g. discord_commands) are skipped.

update public.parrot_tool_descriptions set example_trigger_phrases = '["roast me", "roast @user", "come at me", "roast them"]'::jsonb, updated_at = now() where tool_slug = 'run_roast';
update public.parrot_tool_descriptions set example_trigger_phrases = '["search for X", "look up X", "find out about X", "what''s the latest on X", "research X"]'::jsonb, updated_at = now() where tool_slug = 'search_web';
update public.parrot_tool_descriptions set example_trigger_phrases = '["create a poll", "poll: who should we pick", "hearing poll", "create a hearing poll"]'::jsonb, updated_at = now() where tool_slug = 'create_hearing_poll';
update public.parrot_tool_descriptions set example_trigger_phrases = '["remind me in 5 minutes", "set a timer for 10 min", "timer for 5 min", "remind me"]'::jsonb, updated_at = now() where tool_slug = 'create_timer';
update public.parrot_tool_descriptions set example_trigger_phrases = '["holla at me", "say X in voice", "say it in VC", "join and say X"]'::jsonb, updated_at = now() where tool_slug = 'join_voice_and_squawk';
update public.parrot_tool_descriptions set example_trigger_phrases = '["sing Never Gonna Give You Up", "sing Bohemian Rhapsody", "can you sing X", "sing something"]'::jsonb, updated_at = now() where tool_slug = 'sing_song';
update public.parrot_tool_descriptions set example_trigger_phrases = '["echo X", "repeat after me", "echo hello"]'::jsonb, updated_at = now() where tool_slug = 'echo';
update public.parrot_tool_descriptions set example_trigger_phrases = '["what tools do you have", "what can you do", "what''s your personality", "what model are you"]'::jsonb, updated_at = now() where tool_slug = 'introspection';
update public.parrot_tool_descriptions set example_trigger_phrases = '["list commands", "what commands do you have", "show me commands"]'::jsonb, updated_at = now() where tool_slug = 'discord_commands';
