"use client";

import { useMemo, useState } from "react";
import { LogsTerminal, type LogRow } from "@/components/logs-terminal";
import { LogsFilterHeader } from "@/components/logs-filter-header";

/** Activity listener logs: [ActivityDB] from activity-listeners.js, [Activity listener] from activity/listener.js */
function isActivityListenerLog(message: string): boolean {
  return /\[ActivityDB\]|\[Activity listener\]/i.test(message);
}

function startOfDay(iso: string): number {
  const d = new Date(iso);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

function endOfDay(iso: string): number {
  const d = new Date(iso);
  d.setUTCHours(23, 59, 59, 999);
  return d.getTime();
}

function applyFilters(
  logs: LogRow[],
  dateFrom: string,
  dateTo: string,
  selectedLevels: Set<string>,
  activityOnly: boolean
): LogRow[] {
  return logs.filter((log) => {
    const t = new Date(log.created_at).getTime();
    if (dateFrom && t < startOfDay(dateFrom)) return false;
    if (dateTo && t > endOfDay(dateTo)) return false;
    if (selectedLevels.size > 0 && !selectedLevels.has(log.level)) return false;
    if (activityOnly && !isActivityListenerLog(log.message)) return false;
    return true;
  });
}

export function LogsWithFilters({ logs }: { logs: LogRow[] }) {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedLevels, setSelectedLevels] = useState<Set<string>>(new Set());
  const [activityOnly, setActivityOnly] = useState(false);

  const filtered = useMemo(
    () =>
      applyFilters(logs, dateFrom, dateTo, selectedLevels, activityOnly),
    [logs, dateFrom, dateTo, selectedLevels, activityOnly]
  );

  const toggleLevel = (level: string) => {
    setSelectedLevels((prev) => {
      const next = new Set(prev);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      return next;
    });
  };

  const clearFilters = () => {
    setDateFrom("");
    setDateTo("");
    setSelectedLevels(new Set());
    setActivityOnly(false);
  };

  const hasActiveFilters =
    !!dateFrom || !!dateTo || selectedLevels.size > 0 || activityOnly;

  return (
    <div className="space-y-4">
      <LogsFilterHeader
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        selectedLevels={selectedLevels}
        onToggleLevel={toggleLevel}
        activityOnly={activityOnly}
        onActivityOnlyChange={setActivityOnly}
        hasActiveFilters={hasActiveFilters}
        onClearFilters={clearFilters}
      />
      <p className="text-xs text-muted-foreground">
        Showing {filtered.length} of {logs.length} log{logs.length === 1 ? "" : "s"}
        {hasActiveFilters && " (filtered)"}.
      </p>
      <LogsTerminal logs={filtered} />
    </div>
  );
}
