import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Mic } from "lucide-react";

const TABLE = "parrot_conversation_history";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from(TABLE)
    .select("id, created_at, channel_id, user_text, response_text, tools_called")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-semibold text-foreground">History</h1>
        <p className="mt-4 text-destructive">
          Failed to load chat history: {error.message}
        </p>
      </div>
    );
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-foreground">Chat history</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Table: <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">parrot_conversation_history</code> (newest first)
      </p>

      {!rows?.length ? (
        <p className="mt-6 text-muted-foreground">No history yet.</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-6">
          {rows.map((row) => {
            const hasVoiceTool =
              Array.isArray(row.tools_called) &&
              row.tools_called.includes("join_voice_and_squawk");
            return (
            <li key={row.id}>
              <Card className="overflow-hidden">
                <CardHeader className="border-b bg-muted/30 py-4">
                  <CardTitle className="flex flex-wrap items-center gap-2 text-sm font-medium text-muted-foreground">
                    {hasVoiceTool ? (
                      <Mic
                        className="size-4 shrink-0 text-purple-500"
                        aria-label="Voice channel tool used"
                      />
                    ) : null}
                    <span>{formatDate(row.created_at)}</span>
                    {row.channel_id ? (
                      <span className="font-mono text-xs">
                        channel_id: {row.channel_id}
                      </span>
                    ) : null}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4 py-4">
                  <HistoryField
                    label="user_text"
                    value={row.user_text}
                    multiline
                  />
                  <HistoryField
                    label="response_text"
                    value={row.response_text}
                    multiline
                  />
                  {Array.isArray(row.tools_called) &&
                  row.tools_called.length > 0 ? (
                    <HistoryField
                      label="tools_called"
                      value={row.tools_called.join(", ")}
                    />
                  ) : null}
                </CardContent>
              </Card>
            </li>
          );
          })}
        </ul>
      )}
    </div>
  );
}

function HistoryField({
  label,
  value,
  multiline = false,
}: {
  label: string;
  value: string | null;
  multiline?: boolean;
}) {
  const display = value?.trim() || "—";
  return (
    <section className="flex flex-col gap-1.5">
      <span
        className="text-xs font-medium uppercase tracking-wider text-muted-foreground"
        title={`Column: ${label}`}
      >
        {label}
      </span>
      <div
        className={
          multiline
            ? "max-h-64 overflow-y-auto rounded-md border bg-muted/20 px-3 py-2 font-mono text-sm leading-relaxed text-foreground whitespace-pre-wrap"
            : "rounded-md border bg-muted/20 px-3 py-2 font-mono text-sm text-foreground"
        }
      >
        {display}
      </div>
    </section>
  );
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  try {
    const d = new Date(value);
    return d.toLocaleString(undefined, {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return value;
  }
}
