"use client";

import { useRef, useEffect } from "react";
import { getLevelColor, parseMessageSegments } from "@/lib/logs-helpers";

export type LogRow = {
  id: string;
  created_at: string;
  level: string;
  message: string;
  meta: Record<string, unknown> | null;
};

const LABEL_COLOR = "text-cyan-400";

function LogLine({
  timestamp,
  level,
  message,
}: {
  timestamp: string;
  level: string;
  message: string;
}) {
  const levelColor = getLevelColor(level);
  const segments = parseMessageSegments(message);

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="flex flex-wrap items-baseline gap-x-2 font-mono text-sm leading-relaxed">
      <span className="shrink-0 text-zinc-500">{formatTime(timestamp)}</span>
      <span className={`shrink-0 font-medium uppercase ${levelColor}`}>
        [{level}]
      </span>
      <span className="min-w-0 break-words text-zinc-100">
        {segments.map((seg, i) =>
          seg.type === "label" ? (
            <span key={i} className={LABEL_COLOR}>
              [{seg.value}]
            </span>
          ) : (
            <span key={i}>{seg.value}</span>
          )
        )}
      </span>
    </div>
  );
}

export function LogsTerminal({ logs }: { logs: LogRow[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs.length]);

  return (
    <div
      className="rounded-lg border border-zinc-700 bg-[#1c1c1c] p-4 font-mono shadow-lg"
      role="log"
      aria-label="Agent logs"
    >
      <div className="mb-2 flex items-center gap-2 border-b border-zinc-700 pb-2 text-xs text-zinc-500">
        <span className="rounded bg-zinc-700 px-1.5 py-0.5">parrott logs</span>
        <span>{logs.length} line{logs.length === 1 ? "" : "s"}</span>
      </div>
      <div className="max-h-[70vh] overflow-y-auto">
        {logs.length === 0 ? (
          <p className="text-zinc-500">No logs yet.</p>
        ) : (
          <div className="space-y-1">
            {logs.map((row) => (
              <LogLine
                key={row.id}
                timestamp={row.created_at}
                level={row.level}
                message={row.message}
              />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>
    </div>
  );
}
