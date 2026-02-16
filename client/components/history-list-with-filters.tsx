"use client";

import { useMemo, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
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

  const filteredRows = useMemo(
    () =>
      filterRows(rows, {
        dateFrom,
        dateTo,
        channelId,
        userName,
        voiceOnly,
        roastOnly,
      }),
    [rows, dateFrom, dateTo, channelId, userName, voiceOnly, roastOnly]
  );

  const hasActiveFilters =
    dateFrom || dateTo || channelId || userName || voiceOnly || roastOnly;

  const clearFilters = () => {
    setDateFrom("");
    setDateTo("");
    setChannelId("");
    setUserName("");
    setVoiceOnly(false);
    setRoastOnly(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4 rounded-lg border bg-muted/20 p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="date-from" className="text-xs text-muted-foreground">
              Date from
            </Label>
            <Input
              id="date-from"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-8 w-36"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="date-to" className="text-xs text-muted-foreground">
              Date to
            </Label>
            <Input
              id="date-to"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-8 w-36"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Channel</Label>
            <Select value={channelId || "all"} onValueChange={(v) => setChannelId(v === "all" ? "" : v)}>
              <SelectTrigger className="h-8 w-40" size="sm">
                <SelectValue placeholder="All channels" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All channels</SelectItem>
                {uniqueChannels.map(([id, name]) => (
                  <SelectItem key={id} value={id}>
                    # {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">User</Label>
            <Select value={userName || "all"} onValueChange={(v) => setUserName(v === "all" ? "" : v)}>
              <SelectTrigger className="h-8 w-36" size="sm">
                <SelectValue placeholder="All users" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All users</SelectItem>
                {uniqueUsers.map((u) => (
                  <SelectItem key={u} value={u}>
                    @{u}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
              <Checkbox
                checked={voiceOnly}
                onCheckedChange={(c) => setVoiceOnly(c === true)}
                aria-label="Voice only"
                className="border-border bg-background data-[state=checked]:bg-primary data-[state=checked]:border-primary"
              />
              <span>Voice</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
              <Checkbox
                checked={roastOnly}
                onCheckedChange={(c) => setRoastOnly(c === true)}
                aria-label="Roast only"
                className="border-border bg-background data-[state=checked]:bg-primary data-[state=checked]:border-primary"
              />
              <span>Roast</span>
            </label>
          </div>
        </div>
        {hasActiveFilters ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-muted-foreground"
            onClick={clearFilters}
          >
            Clear filters
          </Button>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">
        Showing {filteredRows.length} of {rows.length} entries
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
              />
              <HistoryField
                label="response_text"
                value={row.response_text}
                multiline
                icon={<ResponseTextIcon />}
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
