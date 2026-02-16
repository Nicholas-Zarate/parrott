import { createClient } from "@/lib/supabase/server";
import { HistoryListWithFilters } from "@/components/history-list-with-filters";
import { parseUserContext, formatHistoryDate } from "@/lib/history-parse";

const TABLE = "parrot_conversation_history";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from(TABLE)
    .select("id, created_at, channel_id, user_text, response_text, tools_called")
    .order("created_at", { ascending: false })
    .limit(200);

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

  const rowsWithMeta = (rows ?? []).map((row) => ({
    ...row,
    parsed: parseUserContext(row.user_text),
    formattedDate: formatHistoryDate(row.created_at),
  }));

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-foreground">Chat history</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Table:{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
          parrot_conversation_history
        </code>{" "}
        (newest first). Channel and user names are parsed from stored context.
      </p>

      {!rowsWithMeta.length ? (
        <p className="mt-6 text-muted-foreground">No history yet.</p>
      ) : (
        <div className="mt-6">
          <HistoryListWithFilters rows={rowsWithMeta} />
        </div>
      )}
    </div>
  );
}
