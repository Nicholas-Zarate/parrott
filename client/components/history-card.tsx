"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Flame, Mic } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type HistoryRow = {
  id: string;
  created_at: string | null;
  channel_id: string | null;
  user_text: string | null;
  response_text: string | null;
  tools_called: string[] | null;
};

export type ParsedNames = {
  userName: string | null;
  channelName: string | null;
};

type HistoryCardProps = {
  row: HistoryRow;
  parsed: ParsedNames;
  formattedDate: string;
  children: React.ReactNode;
};

function Chip({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border bg-muted/50 px-2.5 py-0.5 text-xs font-medium text-foreground",
        className
      )}
    >
      {children}
    </span>
  );
}

export function HistoryCard({
  row,
  parsed,
  formattedDate,
  children,
}: HistoryCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const tools = Array.isArray(row.tools_called) ? row.tools_called : [];
  const hasVoiceTool = tools.includes("join_voice_and_squawk");
  const hasRoastTool = tools.includes("run_roast");
  const otherTools = tools.filter(
    (t) => t !== "join_voice_and_squawk" && t !== "run_roast"
  );
  const rawResponse = row.response_text?.trim() ?? "";
  const responseSnippet =
    rawResponse.length > 0
      ? rawResponse.slice(0, 60).replace(/\n/g, " ") + (rawResponse.length > 60 ? "…" : "")
      : null;

  return (
    <Card className="overflow-hidden gap-0 py-0">
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        className="w-full rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-expanded={isOpen}
      >
        <CardHeader className="flex flex-col gap-1.5 border-b bg-muted/30 px-3 py-2 pe-3">
          {/* Row 1: toggle + chips + response snippet */}
          <div className="flex min-h-0 flex-shrink-0 flex-row items-center gap-2">
            <span className="flex size-6 shrink-0 items-center justify-center text-muted-foreground">
              {isOpen ? (
                <ChevronDown className="size-4" aria-hidden />
              ) : (
                <ChevronRight className="size-4" aria-hidden />
              )}
            </span>
            <CardTitle className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-sm font-medium text-foreground">
              {parsed.channelName ? (
                <Chip title={`channel_id: ${row.channel_id ?? ""}`}>
                  # {parsed.channelName}
                </Chip>
              ) : row.channel_id ? (
                <Chip className="font-mono">ch: {row.channel_id}</Chip>
              ) : null}
              {parsed.userName ? (
                <Chip>@{parsed.userName}</Chip>
              ) : null}
              {hasVoiceTool ? (
                <Chip className="border-purple-200 bg-purple-50 text-purple-800 dark:border-purple-800 dark:bg-purple-950/50 dark:text-purple-200">
                  <Mic className="mr-1 size-3" aria-hidden />
                  voice
                </Chip>
              ) : null}
              {hasRoastTool ? (
                <Chip className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
                  <Flame className="mr-1 size-3" aria-hidden />
                  roast
                </Chip>
              ) : null}
              {otherTools.map((t) => (
                <Chip key={t}>{t}</Chip>
              ))}
            </CardTitle>
          </div>
          {!isOpen && responseSnippet ? (
            <p className="line-clamp-1 pl-8 text-xs text-muted-foreground">
              {responseSnippet}
            </p>
          ) : null}
          {/* Row 2: date on bottom */}
          <p className="pl-8 text-xs text-muted-foreground">
            {formattedDate}
          </p>
        </CardHeader>
      </button>
      {isOpen ? (
        <CardContent className="flex flex-col gap-4 px-3 py-3">
          {children}
        </CardContent>
      ) : null}
    </Card>
  );
}
