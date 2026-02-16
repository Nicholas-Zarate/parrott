import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { getHighlightSegments } from "@/lib/history-search";

export function HistoryField({
  label,
  value,
  multiline = false,
  icon,
  highlightTerms = [],
}: {
  label: string;
  value: string | null;
  multiline?: boolean;
  icon?: React.ReactNode;
  /** When set, matching substrings are wrapped in <mark> for search highlight */
  highlightTerms?: string[];
}) {
  const raw = value?.trim() || "";
  const display = raw || "—";
  const segments =
    highlightTerms.length > 0 && raw
      ? getHighlightSegments(raw, highlightTerms)
      : null;

  return (
    <section className="flex flex-col gap-1.5">
      <span
        className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground"
        title={`Column: ${label}`}
      >
        {icon ?? null}
        {label}
      </span>
      <div
        className={
          multiline
            ? "max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/20 px-3 py-2 font-mono text-sm leading-relaxed text-foreground"
            : "rounded-md border bg-muted/20 px-3 py-2 font-mono text-sm text-foreground"
        }
      >
        {segments ? (
          <>
            {segments.map((seg, i) =>
              seg.type === "mark" ? (
                <mark key={i} className="rounded bg-primary/30 font-medium">
                  {seg.value}
                </mark>
              ) : (
                <span key={i}>{seg.value}</span>
              )
            )}
          </>
        ) : (
          display
        )}
      </div>
    </section>
  );
}

export function UserTextIcon() {
  return <ArrowDownToLine className="size-4 text-muted-foreground" aria-hidden />;
}

export function ResponseTextIcon() {
  return <ArrowUpFromLine className="size-4 text-muted-foreground" aria-hidden />;
}
