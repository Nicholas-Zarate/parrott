"use client";

import { useEffect, useState } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { FilterHeaderBar } from "@/components/filter-header-bar";
import { HISTORY_SEARCH_DEBOUNCE_MS } from "@/lib/history-search";

export type HistoryFilterHeaderProps = {
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  isSearching?: boolean;
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
 * Filter header for the History page. Renders search, date range, channel/user selects, and voice/roast checkboxes.
 */
export function HistoryFilterHeader({
  searchQuery,
  onSearchQueryChange,
  isSearching = false,
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
  const [inputValue, setInputValue] = useState(searchQuery);

  useEffect(() => {
    setInputValue(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    const t = setTimeout(() => {
      onSearchQueryChange(inputValue);
    }, HISTORY_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [inputValue, onSearchQueryChange]);

  const hasDateFilter = Boolean(dateFrom || dateTo);

  return (
    <FilterHeaderBar showClear={hasActiveFilters} onClear={onClearFilters}>
      <div className="space-y-1.5 min-w-[200px]">
        <Label htmlFor="history-search" className="text-xs text-muted-foreground">
          Search
        </Label>
        <div className="relative">
          <Search
            className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id="history-search"
            type="search"
            placeholder="User messages & bot responses…"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            className="h-8 pl-8 pr-8"
            aria-busy={isSearching}
          />
          {isSearching ? (
            <span
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            >
              …
            </span>
          ) : null}
        </div>
      </div>
      <Sheet>
        <SheetTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            aria-label="Advanced filters"
            disabled={isSearching}
          >
            <SlidersHorizontal className="size-4" aria-hidden />
            <span>Advanced</span>
            {hasDateFilter ? (
              <span className="flex size-1.5 rounded-full bg-primary" aria-hidden />
            ) : null}
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="flex flex-col sm:max-w-sm">
          <SheetHeader>
            <SheetTitle>Advanced filters</SheetTitle>
            <p className="text-sm text-muted-foreground">
              Date range and other options.
            </p>
          </SheetHeader>
          <div className="flex flex-col gap-6 px-1 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="history-date-from" className="text-xs text-muted-foreground">
                Date from
              </Label>
              <Input
                id="history-date-from"
                type="date"
                value={dateFrom}
                onChange={(e) => onDateFromChange(e.target.value)}
                className="h-9 w-full"
                disabled={isSearching}
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
                className="h-9 w-full"
                disabled={isSearching}
              />
            </div>
          </div>
        </SheetContent>
      </Sheet>
      <div className={`space-y-1.5 ${isSearching ? "pointer-events-none opacity-60" : ""}`}>
        <Label className="text-xs text-muted-foreground">Channel</Label>
        <Select
          value={channelId || "all"}
          onValueChange={(v) => onChannelIdChange(v === "all" ? "" : v)}
        >
          <SelectTrigger className="h-8 w-40" size="sm" disabled={isSearching}>
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
      <div className={`space-y-1.5 ${isSearching ? "pointer-events-none opacity-60" : ""}`}>
        <Label className="text-xs text-muted-foreground">User</Label>
        <Select
          value={userName || "all"}
          onValueChange={(v) => onUserNameChange(v === "all" ? "" : v)}
        >
          <SelectTrigger className="h-8 w-36" size="sm" disabled={isSearching}>
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
      <div
        className={`flex items-center gap-4 ${isSearching ? "pointer-events-none opacity-60" : ""}`}
      >
        <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
          <Checkbox
            checked={voiceOnly}
            onCheckedChange={(c) => onVoiceOnlyChange(c === true)}
            aria-label="Voice only"
            className="border-border bg-background data-[state=checked]:bg-primary data-[state=checked]:border-primary"
            disabled={isSearching}
          />
          <span>Voice</span>
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
          <Checkbox
            checked={roastOnly}
            onCheckedChange={(c) => onRoastOnlyChange(c === true)}
            aria-label="Roast only"
            className="border-border bg-background data-[state=checked]:bg-primary data-[state=checked]:border-primary"
            disabled={isSearching}
          />
          <span>Roast</span>
        </label>
      </div>
    </FilterHeaderBar>
  );
}
