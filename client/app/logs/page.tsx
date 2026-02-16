import { createClient } from "@/lib/supabase/server";
import { LogsWithFilters } from "@/components/logs-with-filters";

const TABLE = "logs";
const LOGS_LIMIT = 200;

export const dynamic = "force-dynamic";

export default async function LogsPage() {
  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from(TABLE)
    .select("id, created_at, level, message, meta")
    .order("created_at", { ascending: false })
    .limit(LOGS_LIMIT);

  if (error) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-semibold text-foreground">Logs</h1>
        <p className="mt-4 text-destructive">
          Failed to load logs: {error.message}
        </p>
      </div>
    );
  }

  const logs = (rows ?? []).map((row) => ({
    id: row.id,
    created_at: row.created_at,
    level: row.level ?? "info",
    message: row.message ?? "",
    meta: row.meta ?? null,
  }));

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-foreground">Logs</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Agent console output (newest first). Table:{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
          logs
        </code>
      </p>

      <div className="mt-6">
        <LogsWithFilters logs={logs} />
      </div>
    </div>
  );
}
