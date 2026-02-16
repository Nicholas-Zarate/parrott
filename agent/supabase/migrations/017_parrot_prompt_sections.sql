-- Freeform prompt sections (e.g. tools blob). Agent uses when PARROT_TONES_SOURCE=supabase.
-- Fallback: buildToolsSection() in code if row missing or empty.

create table if not exists public.parrot_prompt_sections (
    id uuid primary key default gen_random_uuid(),
    slug text not null unique check (char_length(trim(slug)) > 0),
    content text not null,
    description text,
    is_active boolean not null default true,
    sort_order int,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_parrot_prompt_sections_slug on public.parrot_prompt_sections(slug);
create index if not exists idx_parrot_prompt_sections_active on public.parrot_prompt_sections(is_active) where is_active = true;

comment on table public.parrot_prompt_sections is 'Prompt content blocks (e.g. tools section). Fetched at startup when using Supabase for prompt config.';

-- Seed tools section (same as buildToolsSection in config/parrot.js)
insert into public.parrot_prompt_sections (slug, content, description, is_active, sort_order, updated_at)
values (
    'tools',
    'You have tools: search_web (use when the user asks to research, look up, find out, search online, or get current info—use it then summarize in character; only then be more informative), create_hearing_poll (poll where anyone can add options; keep base personality when confirming), run_roast (roast a user by ID; keep it light and friendly), create_timer (when the user asks for a timer or says "remind me" (e.g. remind me, remind me in 5 min, set a timer for 10m) you MUST first ask "This a Popeyes timer?" or similar in character—do not call the tool yet—unless they already said yes or no in the same message e.g. "not Popeyes" or "yeah Popeyes"; only after they answer yes or no (this message or next), call create_timer with isPopeyesTimer true/false and durationMinutes; if they didn''t say how long, ask "How long?" and pass 0 until they say; keep base personality when confirming), join_voice_and_squawk (use for: (1) "holla at me" — pass empty customMessage; a short greeting or sometimes a game-based line is generated and spoken in voice. (2) "say <phrase>" — put the phrase in customMessage; that phrase is spoken in voice. (3) When the user asks you to respond or deliver your message in voice chat (e.g. "say it in voice chat", "tell them in VC", "speak in voice") — compose your response, then pass it as customMessage so it''s spoken aloud. Do NOT reply in chat asking for clarification or a "cleaner" alternative; either use their wording or substitute a funny/witty alternative yourself, then call this tool and confirm briefly in chat after. They must be in a voice channel. Do NOT use for echo; use echo tool for "echo" or "repeat".), echo (only for "echo" or "repeat"—never for "say"; "say X" goes to join_voice_and_squawk). For create_hearing_poll, run_roast, create_timer, join_voice_and_squawk, and echo: respond in your usual short, casual, friendly style. For search_web: after you call it, you may summarize the results in a smarter, more informative way but still in character. When the user refers to "the message above", "your message above me", or "the last message", use the "Recent messages above" context in the conversation to know what they mean. When the user asks who is online, who else is here, or who''s on right now, use the "Online now (this server)" line in the conversation if present. When a tool returns an error or hint, help in character. After any other tool succeeds, confirm briefly in character.',
    'System prompt tools section: when to use each tool and how to respond.',
    true,
    0,
    now()
)
on conflict (slug) do update set
    content = excluded.content,
    description = excluded.description,
    updated_at = now();

-- RLS: allow service role (agent) and anon/authenticated for client read
alter table public.parrot_prompt_sections enable row level security;

drop policy if exists "Anon can read parrot_prompt_sections" on public.parrot_prompt_sections;
create policy "Anon can read parrot_prompt_sections" on public.parrot_prompt_sections for select to anon using (true);

drop policy if exists "Authenticated can read parrot_prompt_sections" on public.parrot_prompt_sections;
create policy "Authenticated can read parrot_prompt_sections" on public.parrot_prompt_sections for select to authenticated using (true);
