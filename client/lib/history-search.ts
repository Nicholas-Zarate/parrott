/**
 * Helpers for history full-text search: RPC params and client-side highlight.
 */

export const HISTORY_SEARCH_DEBOUNCE_MS = 350;
export const HISTORY_SEARCH_RESULT_LIMIT = 200;

export type SearchConversationParams = {
  search_query: string | null;
  filter_channel_id: string | null;
  filter_date_from: string | null;
  filter_date_to: string | null;
  result_limit: number;
  result_offset: number;
};

export type HistorySearchFilters = {
  dateFrom: string;
  dateTo: string;
  channelId: string;
};

/**
 * Build params for search_conversation_history RPC.
 * Converts date inputs (YYYY-MM-DD) to start/end of day ISO strings.
 */
export function buildSearchParams(
  filters: HistorySearchFilters,
  searchQuery: string,
  limit = HISTORY_SEARCH_RESULT_LIMIT,
  offset = 0
): SearchConversationParams {
  const trimmed = searchQuery.trim();
  let dateFrom: string | null = null;
  let dateTo: string | null = null;
  if (filters.dateFrom) {
    const d = new Date(filters.dateFrom);
    d.setHours(0, 0, 0, 0);
    dateFrom = d.toISOString();
  }
  if (filters.dateTo) {
    const d = new Date(filters.dateTo);
    d.setHours(23, 59, 59, 999);
    dateTo = d.toISOString();
  }
  return {
    search_query: trimmed || null,
    filter_channel_id: filters.channelId || null,
    filter_date_from: dateFrom,
    filter_date_to: dateTo,
    result_limit: limit,
    result_offset: offset,
  };
}

export type HighlightSegment = { type: "text"; value: string } | { type: "mark"; value: string };

/**
 * Split a string into segments for highlighting: alternating text and mark.
 * Terms are matched case-insensitively; overlapping matches are merged.
 */
export function getHighlightSegments(text: string, terms: string[]): HighlightSegment[] {
  if (!text || terms.length === 0) return [{ type: "text", value: text }];
  const lower = text.toLowerCase();
  const normalizedTerms = terms
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0);
  if (normalizedTerms.length === 0) return [{ type: "text", value: text }];

  type Span = { start: number; end: number };
  const spans: Span[] = [];
  for (const term of normalizedTerms) {
    if (!term) continue;
    let pos = 0;
    while (pos < lower.length) {
      const i = lower.indexOf(term, pos);
      if (i === -1) break;
      spans.push({ start: i, end: i + term.length });
      pos = i + 1;
    }
  }
  if (spans.length === 0) return [{ type: "text", value: text }];

  spans.sort((a, b) => a.start - b.start);
  const merged: Span[] = [];
  for (const s of spans) {
    const last = merged[merged.length - 1];
    if (last && s.start <= last.end) {
      last.end = Math.max(last.end, s.end);
    } else {
      merged.push({ ...s });
    }
  }

  const out: HighlightSegment[] = [];
  let idx = 0;
  for (const { start, end } of merged) {
    if (idx < start) {
      out.push({ type: "text", value: text.slice(idx, start) });
    }
    out.push({ type: "mark", value: text.slice(start, end) });
    idx = end;
  }
  if (idx < text.length) {
    out.push({ type: "text", value: text.slice(idx) });
  }
  return out;
}

/**
 * Parse search query into terms for highlighting (split on spaces, trim).
 */
export function getHighlightTerms(searchQuery: string): string[] {
  if (!searchQuery?.trim()) return [];
  return searchQuery
    .trim()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}
