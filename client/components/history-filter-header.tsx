"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FilterHeaderBar } from "@/components/filter-header-bar";

export type HistoryFilterHeaderProps = {
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  channelId: string;
  onChannelIdChange: (value: string) => void;
  uniqueChannels: [id: string, name: string][];
  userName: string;
  onUserNameChange: (value: string) => void;
  uniqueUsers: string[];
  voiceOnly: boolean;
  onVoiceOnlyChange: (value: boolean) => void;
  roastOnly: boolean;
  onRoastOnlyChange: (value: boolean) => void;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
};

/**
 * Filter header for the History page. Renders date range, channel/user selects, and voice/roast checkboxes.
 */
export function HistoryFilterHeader({
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  channelId,
  onChannelIdChange,
  uniqueChannels,
  userName,
  onUserNameChange,
  uniqueUsers,
  voiceOnly,
  onVoiceOnlyChange,
  roastOnly,
  onRoastOnlyChange,
  hasActiveFilters,
  onClearFilters,
}: HistoryFilterHeaderProps) {
  return (
    <FilterHeaderBar showClear={hasActiveFilters} onClear={onClearFilters}>
      <div className="space-y-1.5">
        <Label htmlFor="history-date-from" className="text-xs text-muted-foreground">
          Date from
        </Label>
        <Input
          id="history-date-from"
          type="date"
          value={dateFrom}
          onChange={(e) => onDateFromChange(e.target.value)}
          className="h-8 w-36"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="history-date-to" className="text-xs text-muted-foreground">
          Date to
        </Label>
        <Input
          id="history-date-to"
          type="date"
          value={dateTo}
          onChange={(e) => onDateToChange(e.target.value)}
          className="h-8 w-36"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Channel</Label>
        <Select
          value={channelId || "all"}
          onValueChange={(v) => onChannelIdChange(v === "all" ? "" : v)}
        >
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
        <Select
          value={userName || "all"}
          onValueChange={(v) => onUserNameChange(v === "all" ? "" : v)}
        >
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
            onCheckedChange={(c) => onVoiceOnlyChange(c === true)}
            aria-label="Voice only"
            className="border-border bg-background data-[state=checked]:bg-primary data-[state=checked]:border-primary"
          />
          <span>Voice</span>
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
          <Checkbox
            checked={roastOnly}
            onCheckedChange={(c) => onRoastOnlyChange(c === true)}
            aria-label="Roast only"
            className="border-border bg-background data-[state=checked]:bg-primary data-[state=checked]:border-primary"
          />
          <span>Roast</span>
        </label>
      </div>
    </FilterHeaderBar>
  );
}
