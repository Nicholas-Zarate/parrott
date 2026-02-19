-- Backfill example_trigger_phrases (jsonb) on tools_meta_data. Same data as 047 but for table tools_meta_data.
-- Only updates existing rows; missing rows are skipped.

update public.tools_meta_data set example_trigger_phrases = '["roast me", "roast @user", "come at me", "roast them"]'::jsonb, updated_at = now() where tool_slug = 'run_roast';
update public.tools_meta_data set example_trigger_phrases = '["search for X", "look up X", "find out about X", "what''s the latest on X", "research X"]'::jsonb, updated_at = now() where tool_slug = 'search_web';
update public.tools_meta_data set example_trigger_phrases = '["create a poll", "poll: who should we pick", "hearing poll", "create a hearing poll"]'::jsonb, updated_at = now() where tool_slug = 'create_hearing_poll';
update public.tools_meta_data set example_trigger_phrases = '["remind me in 5 minutes", "set a timer for 10 min", "timer for 5 min", "remind me"]'::jsonb, updated_at = now() where tool_slug = 'create_timer';
update public.tools_meta_data set example_trigger_phrases = '["holla at me", "say X in voice", "say it in VC", "join and say X"]'::jsonb, updated_at = now() where tool_slug = 'join_voice_and_squawk';
update public.tools_meta_data set example_trigger_phrases = '["sing Never Gonna Give You Up", "sing Bohemian Rhapsody", "can you sing X", "sing something"]'::jsonb, updated_at = now() where tool_slug = 'sing_song';
update public.tools_meta_data set example_trigger_phrases = '["echo X", "repeat after me", "echo hello"]'::jsonb, updated_at = now() where tool_slug = 'echo';
update public.tools_meta_data set example_trigger_phrases = '["what tools do you have", "what can you do", "what''s your personality", "what model are you"]'::jsonb, updated_at = now() where tool_slug = 'introspection';
update public.tools_meta_data set example_trigger_phrases = '["list commands", "what commands do you have", "show me commands"]'::jsonb, updated_at = now() where tool_slug = 'discord_commands';
