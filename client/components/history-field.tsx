import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";

export function HistoryField({
  label,
  value,
  multiline = false,
  icon,
}: {
  label: string;
  value: string | null;
  multiline?: boolean;
  icon?: React.ReactNode;
}) {
  const display = value?.trim() || "—";
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
        {display}
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
