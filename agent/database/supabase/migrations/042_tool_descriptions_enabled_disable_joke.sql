-- Surface is_active as enabled/disabled for tools and introspection.
-- Disable make_joke_like so it appears as disabled in UI and introspection (tool code is commented out in with-tools.js).
comment on column public.parrot_tool_descriptions.is_active is 'When false, tool is disabled: shown as disabled in UI and introspection tools list; agent must not register the tool in buildTools() to fully disable.';

update public.parrot_tool_descriptions
set is_active = false, updated_at = now()
where tool_slug = 'make_joke_like';
