-- Add example_command to parrot_tool_descriptions for introspection 'tools' subtool (user-facing examples).
alter table public.parrot_tool_descriptions add column if not exists example_command text;
comment on column public.parrot_tool_descriptions.example_command is 'Short example command or phrase (e.g. "roast @user") for listing tools to users.';
