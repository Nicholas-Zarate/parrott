-- RPC: search conversation history by text (FTS with ILIKE fallback for short queries)
-- and optional filters (channel, date range). Callable by authenticated users; RLS on table applies.

create or replace function public.search_conversation_history(
  search_query text default null,
  filter_channel_id text default null,
  filter_date_from timestamptz default null,
  filter_date_to timestamptz default null,
  result_limit int default 200,
  result_offset int default 0
)
returns table (
  id uuid,
  created_at timestamptz,
  channel_id text,
  user_text text,
  response_text text,
  tools_called text[],
  rank real
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  q text;
  use_fts boolean;
begin
  q := nullif(trim(search_query), '');
  use_fts := (q is not null and length(q) > 2);

  return query
  select
    h.id,
    h.created_at,
    h.channel_id,
    h.user_text,
    h.response_text,
    h.tools_called,
    case
      when q is null then 0.0
      when use_fts then ts_rank(h.fts, websearch_to_tsquery('english', q))
      else 0.0
    end as rank
  from public.parrot_conversation_history h
  where
    (filter_channel_id is null or h.channel_id = filter_channel_id)
    and (filter_date_from is null or h.created_at >= filter_date_from)
    and (filter_date_to is null or h.created_at <= filter_date_to)
    and (
      q is null
      or (
        use_fts
        and h.fts @@ websearch_to_tsquery('english', q)
      )
      or (
        not use_fts
        and (
          h.user_text ilike '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
          or h.response_text ilike '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
        )
      )
    )
  order by
    case when q is not null and use_fts
      then ts_rank(h.fts, websearch_to_tsquery('english', q))
      else 0.0
    end desc,
    h.created_at desc
  limit greatest(0, least(result_limit, 500))
  offset greatest(0, result_offset);
end;
$$;

comment on function public.search_conversation_history is 'Search conversation history by user_text and response_text (FTS for 3+ chars, ILIKE for 1-2 chars). Optional filters: channel_id, date range. Returns rows with rank for relevance ordering.';
