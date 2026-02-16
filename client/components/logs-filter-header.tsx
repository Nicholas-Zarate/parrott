"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { FilterHeaderBar } from "@/components/filter-header-bar";

const LOG_LEVELS = ["error", "warn", "info", "debug"] as const;

export type LogsFilterHeaderProps = {
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  selectedLevels: Set<string>;
  onToggleLevel: (level: string) => void;
  activityOnly: boolean;
  onActivityOnlyChange: (value: boolean) => void;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
};

/**
 * Filter header for the Logs page. Renders date range, level toggles, and activity-only checkbox.
 */
export function LogsFilterHeader({
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  selectedLevels,
  onToggleLevel,
  activityOnly,
  onActivityOnlyChange,
  hasActiveFilters,
  onClearFilters,
}: LogsFilterHeaderProps) {
  return (
    <FilterHeaderBar showClear={hasActiveFilters} onClear={onClearFilters}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="logs-date-from" className="text-xs text-muted-foreground">
          From date
        </Label>
        <Input
          id="logs-date-from"
          type="date"
          value={dateFrom}
          onChange={(e) => onDateFromChange(e.target.value)}
          className="w-40 font-mono text-sm"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="logs-date-to" className="text-xs text-muted-foreground">
          To date
        </Label>
        <Input
          id="logs-date-to"
          type="date"
          value={dateTo}
          onChange={(e) => onDateToChange(e.target.value)}
          className="w-40 font-mono text-sm"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-muted-foreground">Type</span>
        <div className="flex flex-wrap gap-2">
          {LOG_LEVELS.map((level) => (
            <Button
              key={level}
              type="button"
              variant={selectedLevels.has(level) ? "default" : "outline"}
              size="xs"
              onClick={() => onToggleLevel(level)}
              className="font-mono capitalize"
            >
              {level}
            </Button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id="logs-activity-only"
          checked={activityOnly}
          onCheckedChange={(checked) => onActivityOnlyChange(checked === true)}
        />
        <Label
          htmlFor="logs-activity-only"
          className="cursor-pointer text-sm text-muted-foreground"
        >
          Activity listener only
        </Label>
      </div>
    </FilterHeaderBar>
  );
}
