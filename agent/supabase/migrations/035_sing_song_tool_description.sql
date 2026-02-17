-- sing_song tool: when user says "sing <song name>", look up famous lyrics and speak them in VC.
-- Also clarify echo: do not use echo for "say" or "sing".

insert into public.parrot_tool_descriptions (tool_slug, description, is_active, updated_at)
values (
  'sing_song',
  'When the user says "sing <song name>" or "sing <artist - song>", call this tool with that song as songQuery. The bot will look up the song''s famous lyrics and speak them in the user''s voice channel via TTS, then leave. The requester must be in a voice channel. Do NOT use for "say <phrase>"—that is join_voice_and_squawk. Only use sing_song for song requests triggered by "sing".',
  true,
  now()
)
on conflict (tool_slug) do update set description = excluded.description, updated_at = now();

update public.parrot_tool_descriptions
set description = 'Echo back a short message in chat only. Use ONLY when they say "echo" or "repeat" (e.g. "echo this", "repeat after me"). Do NOT use echo when they say "say"—for "say X" use join_voice_and_squawk with customMessage X so it is spoken in voice. Do NOT use echo for "sing"—for "sing <song>" use sing_song (requester must be in a voice channel).',
    updated_at = now()
where tool_slug = 'echo';
