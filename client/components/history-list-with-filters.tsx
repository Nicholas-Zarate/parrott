"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { parseUserContext, formatHistoryDate } from "@/lib/history-parse";
import { buildSearchParams, getHighlightTerms, HISTORY_SEARCH_RESULT_LIMIT } from "@/lib/history-search";
import { HistoryFilterHeader } from "@/components/history-filter-header";
import { HistoryCard, type HistoryRow, type ParsedNames } from "@/components/history-card";
import { HistoryField, UserTextIcon, ResponseTextIcon } from "@/components/history-field";

export type HistoryRowWithMeta = HistoryRow & {
  parsed: ParsedNames;
  formattedDate: string;
};

function filterRows(
  rows: HistoryRowWithMeta[],
  filters: {
    dateFrom: string;
    dateTo: string;
    channelId: string;
    userName: string;
    voiceOnly: boolean;
    roastOnly: boolean;
  }
): HistoryRowWithMeta[] {
  return rows.filter((row) => {
    if (filters.dateFrom) {
      const rowDate = row.created_at ? new Date(row.created_at) : null;
      const from = new Date(filters.dateFrom);
      from.setHours(0, 0, 0, 0);
      if (!rowDate || rowDate < from) return false;
    }
    if (filters.dateTo) {
      const rowDate = row.created_at ? new Date(row.created_at) : null;
      const to = new Date(filters.dateTo);
      to.setHours(23, 59, 59, 999);
      if (!rowDate || rowDate > to) return false;
    }
    if (filters.channelId && row.channel_id !== filters.channelId) return false;
    if (filters.userName && row.parsed.userName !== filters.userName) return false;
    const tools = Array.isArray(row.tools_called) ? row.tools_called : [];
    if (filters.voiceOnly && !tools.includes("join_voice_and_squawk")) return false;
    if (filters.roastOnly && !tools.includes("run_roast")) return false;
    return true;
  });
}

export function HistoryListWithFilters({ rows }: { rows: HistoryRowWithMeta[] }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<HistoryRowWithMeta[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [channelId, setChannelId] = useState("");
  const [userName, setUserName] = useState("");
  const [voiceOnly, setVoiceOnly] = useState(false);
  const [roastOnly, setRoastOnly] = useState(false);

  const { uniqueChannels, uniqueUsers } = useMemo(() => {
    const channels = new Map<string, string>();
    const users = new Set<string>();
    for (const row of rows) {
      if (row.channel_id) {
        const name = row.parsed.channelName ?? row.channel_id;
        channels.set(row.channel_id, name);
      }
      if (row.parsed.userName) users.add(row.parsed.userName);
    }
    return {
      uniqueChannels: Array.from(channels.entries()).sort((a, b) =>
        a[1].localeCompare(b[1])
      ),
      uniqueUsers: Array.from(users).sort(),
    };
  }, [rows]);

  const searchRunIdRef = useRef(0);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    const runId = ++searchRunIdRef.current;
    setIsSearching(true);
    const supabase = createClient();
    const params = buildSearchParams(
      { dateFrom, dateTo, channelId },
      searchQuery,
      HISTORY_SEARCH_RESULT_LIMIT,
      0
    );
    supabase
      .rpc("search_conversation_history", params)
      .then(
        ({ data, error }) => {
          if (runId !== searchRunIdRef.current) return;
          setIsSearching(false);
          if (error) {
            setSearchResults([]);
            return;
          }
          const withMeta: HistoryRowWithMeta[] = (data ?? []).map((row: HistoryRow) => ({
            ...row,
            parsed: parseUserContext(row.user_text),
            formattedDate: formatHistoryDate(row.created_at),
          }));
          setSearchResults(withMeta);
        },
        () => {
          if (runId !== searchRunIdRef.current) return;
          setIsSearching(false);
          setSearchResults([]);
        }
      );
  }, [searchQuery, dateFrom, dateTo, channelId]);

  const sourceRows = searchResults !== null ? searchResults : rows;
  const filteredRows = useMemo(
    () =>
      filterRows(sourceRows, {
        dateFrom,
        dateTo,
        channelId,
        userName,
        voiceOnly,
        roastOnly,
      }),
    [sourceRows, dateFrom, dateTo, channelId, userName, voiceOnly, roastOnly]
  );

  const hasActiveFilters = Boolean(
    searchQuery.trim() ||
    dateFrom ||
    dateTo ||
    channelId ||
    userName ||
    voiceOnly ||
    roastOnly
  );

  const clearFilters = useCallback(() => {
    setSearchQuery("");
    setSearchResults(null);
    setDateFrom("");
    setDateTo("");
    setChannelId("");
    setUserName("");
    setVoiceOnly(false);
    setRoastOnly(false);
  }, []);

  const highlightTerms = useMemo(() => getHighlightTerms(searchQuery), [searchQuery]);
  const totalCount = searchResults !== null ? searchResults.length : rows.length;

  return (
    <div className="space-y-4">
      <HistoryFilterHeader
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        isSearching={isSearching}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        channelId={channelId}
        onChannelIdChange={setChannelId}
        uniqueChannels={uniqueChannels}
        userName={userName}
        onUserNameChange={setUserName}
        uniqueUsers={uniqueUsers}
        voiceOnly={voiceOnly}
        onVoiceOnlyChange={setVoiceOnly}
        roastOnly={roastOnly}
        onRoastOnlyChange={setRoastOnly}
        hasActiveFilters={hasActiveFilters}
        onClearFilters={clearFilters}
      />

      <p className="text-xs text-muted-foreground">
        Showing {filteredRows.length} of {totalCount} entries
        {hasActiveFilters ? " (filtered)" : ""}
        {searchQuery.trim() ? " (server search)" : ""}.
      </p>

      <ul className="flex flex-col gap-2">
        {filteredRows.map((row) => (
          <li key={row.id}>
            <HistoryCard
              row={row}
              parsed={row.parsed}
              formattedDate={row.formattedDate}
            >
              <HistoryField
                label="user_text"
                value={row.user_text}
                multiline
                icon={<UserTextIcon />}
                highlightTerms={highlightTerms}
              />
              <HistoryField
                label="response_text"
                value={row.response_text}
                multiline
                icon={<ResponseTextIcon />}
                highlightTerms={highlightTerms}
              />
              {Array.isArray(row.tools_called) && row.tools_called.length > 0 ? (
                <HistoryField
                  label="tools_called"
                  value={row.tools_called.join(", ")}
                />
              ) : null}
            </HistoryCard>
          </li>
        ))}
      </ul>
    </div>
  );
}
