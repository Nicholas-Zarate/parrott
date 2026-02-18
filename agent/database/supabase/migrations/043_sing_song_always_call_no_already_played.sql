-- Fix: model was replying "already played in VC" when user asked to sing again.
-- Cause: previous turn context sends only the bot's visible message text (no tool call/result),
-- so the model sees its own prior reply and may refuse to call sing_song again.
-- Instruct the model to call sing_song every time the user asks; do not say "already played".

update public.parrot_tool_descriptions
set
  description = 'When the user says "sing <song name>" or "sing <artist - song>", call this tool with that song as songQuery. The bot will look up the song''s famous lyrics and speak them in the user''s voice channel via TTS, then leave. The requester must be in a voice channel. Do NOT use for "say <phrase>"—that is join_voice_and_squawk. Only use sing_song for song requests triggered by "sing". Call sing_song every time the user asks to sing; do not reply that you have already sung it or already played it—each request is independent.',
  updated_at = now()
where tool_slug = 'sing_song';
