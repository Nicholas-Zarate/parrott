-- Allow roast in voice: update tool descriptions so the model chains run_roast + join_voice_and_squawk
-- when the user asks to roast someone in voice chat or in VC (no code change; model does two tool calls).

update public.parrot_tool_descriptions
set
  description = 'Generate a short roast for a Discord user based on their recent messages. Use when the user asks to roast someone or "roast @user". Requires the target Discord user ID. Uses last 7 days and server scope by default. For a roast in voice chat or in VC: call run_roast first to get the roast text, then call join_voice_and_squawk with that roast as customMessage (the person requesting must be in a voice channel).',
  updated_at = now()
where tool_slug = 'run_roast';

update public.parrot_tool_descriptions
set
  description = 'Join the user''s voice channel and speak via text-to-speech, then leave. Use for: (1) "holla at me" — pass empty customMessage; a short greeting (or occasionally a game-based line) is generated and spoken. (2) "say <phrase>" — pass the phrase in customMessage; that phrase is spoken. (3) When the user asks you to respond in voice chat / say it in VC / speak in voice — generate your response first, then pass it as customMessage so it is spoken. (4) Roast in voice: when the user asks to roast someone in voice chat or in VC, first call run_roast to get the roast text, then call this tool with that text as customMessage; the requester must be in a voice channel. Do not reply in chat asking for clarification or a "cleaner" version; either use their wording or a funny/witty alternative you choose, then call this tool. They must be in a voice channel. If you previously offered an alternative phrase (e.g. a neutral version) and the user agrees (e.g. says "yes"), call this tool with that phrase in customMessage. Do NOT use for echo/repeat (use echo tool for that).',
  updated_at = now()
where tool_slug = 'join_voice_and_squawk';
