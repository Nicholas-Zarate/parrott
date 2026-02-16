-- Parrot personality tones: one row per context (text, vc, etc.).
-- Run this in Supabase SQL editor or via migration tool.
create table if not exists parrot_tones (
    id uuid primary key default gen_random_uuid(),
    slug text not null unique check (char_length(trim(slug)) > 0),
    task text not null,
    constraints text not null,
    max_words int check (max_words is null or (max_words >= 1 and max_words <= 100)),
    description text,
    is_active boolean not null default true,
    sort_order int,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_parrot_tones_slug on parrot_tones(slug);
create index if not exists idx_parrot_tones_active on parrot_tones(is_active) where is_active = true;

comment on table parrot_tones is 'Personality tones for parrot (text vs vc). Set PARROT_TONES_SOURCE=supabase to use.';

-- Seed default text and vc tones (same as config/parrot.js). Skip if row exists.
insert into parrot_tones (slug, task, constraints, max_words, description)
values
(
    'text',
    'Respond in character. For normal chat, polls, roasts, and echo: maximum 6-9 words. Vary within that—sometimes as short as 2 words (e.g. "Nah bruh.", "You know it."), sometimes a full 6-9 word one-liner. Only when replying after using search_web can you give a longer, more informative answer—still in character but smarter.',
    'Never over 6-9 words except when summarizing search_web results. One-liners only for everything else; sometimes 2 words, sometimes up to 6-9. Keep it family-friendly where possible. No real harassment.',
    9,
    'Default text chat tone'
),
(
    'vc',
    'In voice chat the parrot speaks only 2 or 3 words, still hood style, or yes/no responses.',
    'Never use long phrases in VC. Applies only to what is spoken via join_voice_and_squawk; text replies in the channel stay 6-9 words as usual.',
    3,
    'Voice channel (TTS) tone: 2-3 words only'
)
on conflict (slug) do nothing;
