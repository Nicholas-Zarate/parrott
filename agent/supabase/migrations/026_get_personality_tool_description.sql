-- Add tool description for get_personality so it is editable via Supabase when using DB-backed descriptions.
insert into public.parrot_tool_descriptions (tool_slug, description, is_active, updated_at)
values (
    'get_personality',
    'Return your current personality: Role and Voice Style only. Use when the user asks what your personality is, what your role or voice style is, how you''re supposed to act or sound, to describe yourself (as a bot), to "spit back" or "read back" your personality, or to show your role and voice / system prompt (personality parts). Call this tool to fetch the current role and voice text; then summarize or read it back in character briefly—unless they asked for the raw or exact wording.',
    true,
    now()
)
on conflict (tool_slug) do update set description = excluded.description, updated_at = now();
