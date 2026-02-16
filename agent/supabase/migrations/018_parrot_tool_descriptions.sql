-- Per-tool descriptions for the AI. Agent uses when PARROT_TONES_SOURCE=supabase.
-- Fallback: in-code description in with-tools.js if row missing or empty.

create table if not exists public.parrot_tool_descriptions (
    id uuid primary key default gen_random_uuid(),
    tool_slug text not null unique check (char_length(trim(tool_slug)) > 0),
    description text not null,
    parameter_descriptions jsonb,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_parrot_tool_descriptions_slug on public.parrot_tool_descriptions(tool_slug);
create index if not exists idx_parrot_tool_descriptions_active on public.parrot_tool_descriptions(is_active) where is_active = true;

comment on table public.parrot_tool_descriptions is 'Tool description text shown to the model. Fetched at startup when using Supabase for prompt config.';

-- Seed with current in-code descriptions (from ai-sdk/with-tools.js)
insert into public.parrot_tool_descriptions (tool_slug, description, is_active, updated_at) values
('run_roast', 'Generate a short roast for a Discord user based on their recent messages. Use when the user asks to roast someone or to "roast @user". Requires the target Discord user ID. Uses last 7 days and server scope by default.', true, now()),
('search_web', 'Search the web for current information, facts, or research. Use when the user asks to look something up, research a topic, get recent news, find facts, says "find out" (e.g. find out about X), or "search online". Returns titles, URLs, and short snippets.', true, now()),
('create_hearing_poll', 'Create a hearing poll (like /vote_hearing): anyone can add options then vote. Use when the user says: create a hearing poll, vote_hearing, vote hearing, run a hearing, do a hearing, or "poll where people can add options". Pass question (required), duration in minutes (use 0 for no limit), and anonymous (false for public votes).', true, now()),
('create_timer', 'Set a timer or reminder. Use when the user says: remind me, remind me in X minutes, set a timer for X, make a timer for X, etc. Pass durationMinutes (1–1440) when the user gave a time; pass 0 when they did NOT say how long (tool will tell you to ask) or when isPopeyesTimer is true. If the user says it''s a Popeyes timer (or says yes when you ask "This a Popeyes timer?"), pass isPopeyesTimer true and durationMinutes 0—the tool will use 10 min + random 2–15 min. Optional reminder text; replyInChannel true to post in channel when it fires, false to DM.', true, now()),
('join_voice_and_squawk', 'Join the user''s voice channel and speak via text-to-speech, then leave. Use for: (1) "holla at me" — pass empty customMessage; a short greeting (or occasionally a game-based line) is generated and spoken. (2) "say <phrase>" — pass the phrase in customMessage; that phrase is spoken. (3) When the user asks you to respond in voice chat / say it in VC / speak in voice — generate your response first, then pass it as customMessage so it is spoken. Do not reply in chat asking for clarification or a "cleaner" version; either use their wording or a funny/witty alternative you choose, then call this tool. They must be in a voice channel. If you previously offered an alternative phrase (e.g. a neutral version) and the user agrees (e.g. says "yes"), call this tool with that phrase in customMessage. Do NOT use for echo/repeat (use echo tool for that).', true, now()),
('echo', 'Echo back a short message in chat only. Use ONLY when they say "echo" or "repeat" (e.g. "echo this", "repeat after me"). Do NOT use echo when they say "say"—for "say X" use join_voice_and_squawk with customMessage X so it is spoken in voice.', true, now())
on conflict (tool_slug) do update set description = excluded.description, updated_at = now();

-- RLS
alter table public.parrot_tool_descriptions enable row level security;

drop policy if exists "Anon can read parrot_tool_descriptions" on public.parrot_tool_descriptions;
create policy "Anon can read parrot_tool_descriptions" on public.parrot_tool_descriptions for select to anon using (true);

drop policy if exists "Authenticated can read parrot_tool_descriptions" on public.parrot_tool_descriptions;
create policy "Authenticated can read parrot_tool_descriptions" on public.parrot_tool_descriptions for select to authenticated using (true);
