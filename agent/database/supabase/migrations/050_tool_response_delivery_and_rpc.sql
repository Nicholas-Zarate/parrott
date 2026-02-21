-- Per-tool response delivery: text, voice, or both. Admin-only to edit (via RPC).
-- When a tool was used in the reply, this controls whether we post in channel and/or TTS in VC.

-- Add column to tools_meta_data (app and agent read from this table name).
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'tools_meta_data') then
    alter table public.tools_meta_data
      add column if not exists response_delivery text not null default 'text'
      check (response_delivery in ('text', 'voice', 'both'));
    comment on column public.tools_meta_data.response_delivery is
      'When this tool was used: deliver reply as text only, voice (TTS) only, or both. Admin-only to change (use update_tool_response_delivery RPC).';
  end if;
  -- Support envs where the physical table is still parrot_tool_descriptions.
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'parrot_tool_descriptions') then
    alter table public.parrot_tool_descriptions
      add column if not exists response_delivery text not null default 'text'
      check (response_delivery in ('text', 'voice', 'both'));
    comment on column public.parrot_tool_descriptions.response_delivery is
      'When this tool was used: deliver reply as text only, voice (TTS) only, or both. Admin-only to change.';
  end if;
end $$;

-- RPC: update response_delivery for a tool. Only admins (is_parrott_admin) can call.
create or replace function public.update_tool_response_delivery(
  p_tool_slug text,
  p_response_delivery text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select private.is_parrott_admin()) is not true then
    raise exception 'Only admins can update tool response delivery.';
  end if;
  if p_response_delivery is null or p_response_delivery not in ('text', 'voice', 'both') then
    raise exception 'response_delivery must be one of: text, voice, both.';
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'tools_meta_data') then
    update public.tools_meta_data
    set response_delivery = p_response_delivery,
        updated_at = now()
    where tool_slug = trim(p_tool_slug);
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'parrot_tool_descriptions') then
    update public.parrot_tool_descriptions
    set response_delivery = p_response_delivery,
        updated_at = now()
    where tool_slug = trim(p_tool_slug);
  end if;
end;
$$;

comment on function public.update_tool_response_delivery(text, text) is
  'Admin-only: set response_delivery (text|voice|both) for a tool. Used by Personality UI.';

grant execute on function public.update_tool_response_delivery(text, text) to authenticated;
revoke execute on function public.update_tool_response_delivery(text, text) from anon;
