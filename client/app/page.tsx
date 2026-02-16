import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoginPromptModal } from "@/components/login-prompt-modal";
import { Megaphone } from "lucide-react";

export const dynamic = "force-dynamic";

type Announcement = {
  id: string;
  created_at: string;
  period_start: string;
  period_end: string;
  rundown_text: string;
  metadata: {
    conversation_count?: number;
    tools_used?: Record<string, number>;
    channel_ids?: string[];
  } | null;
};

export default async function Home() {
  const supabase = await createClient();
  const { data: latest } = await supabase
    .from("parrot_announcements")
    .select("id, created_at, period_start, period_end, rundown_text, metadata")
    .order("period_end", { ascending: false })
    .limit(1)
    .single<Announcement>();

  const { data: allAnnouncements } = await supabase
    .from("parrot_announcements")
    .select("id, created_at, period_start, period_end, rundown_text, metadata")
    .order("period_end", { ascending: false })
    .limit(20);

  const announcements = (allAnnouncements ?? []) as Announcement[];

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-foreground">Home</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Welcome. Use the sidebar to navigate.
      </p>

      <section className="mt-8">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Megaphone className="size-4" aria-hidden />
          Latest announcement
        </div>

        {latest ? (
          <Card className="gap-0 overflow-hidden py-0">
            <CardHeader className="border-b bg-muted/30 px-4 py-3">
              <CardTitle className="flex items-center gap-3 text-base font-semibold text-foreground">
                <Image
                  src="/assets/toucan_white.png"
                  alt="Parrott"
                  width={40}
                  height={40}
                  className="shrink-0 rounded-full"
                />
                <span>Parrott</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 px-4 py-4">
              <p className="text-sm leading-relaxed text-foreground">
                {latest.rundown_text}
              </p>
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span>
                  {formatRange(latest.period_start, latest.period_end)}
                </span>
                {latest.metadata?.conversation_count != null ? (
                  <Badge variant="default">
                    {latest.metadata.conversation_count} conversation{latest.metadata.conversation_count === 1 ? "" : "s"}
                  </Badge>
                ) : null}
                {latest.metadata?.tools_used
                  ? Object.entries(latest.metadata.tools_used).map(([tool, count]) => (
                      <Badge key={tool} variant="default">
                        {tool}: {count}
                      </Badge>
                    ))
                  : null}
              </div>
            </CardContent>
          </Card>
        ) : (
          <p className="text-sm text-muted-foreground">
            No announcements yet. The parrot generates a rundown every 6 hours.
          </p>
        )}
      </section>

      {announcements.length > 0 ? (
        <section className="mt-10">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Megaphone className="size-4" aria-hidden />
            Announcements (read-only)
          </div>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left font-medium px-4 py-2.5 text-foreground">Period</th>
                  <th className="text-left font-medium px-4 py-2.5 text-foreground">Rundown</th>
                </tr>
              </thead>
              <tbody>
                {announcements.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                      {formatRange(row.period_start, row.period_end)}
                    </td>
                    <td className="px-4 py-2.5 text-foreground max-w-md">
                      <span className="line-clamp-2">{row.rundown_text}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <LoginPromptModal />
    </div>
  );
}

function formatRange(start: string, end: string): string {
  try {
    const opts: Intl.DateTimeFormatOptions = {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    };
    const s = new Date(start).toLocaleString(undefined, opts);
    const e = new Date(end).toLocaleString(undefined, opts);
    return `${s} — ${e}`;
  } catch {
    return `${start} — ${end}`;
  }
}
