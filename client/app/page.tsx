import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExpandableText } from "@/components/expandable-text";
import { Clock, Megaphone } from "lucide-react";

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

  const [latestResult, allResult] = await Promise.all([
    supabase
      .from("parrot_announcements")
      .select("id, created_at, period_start, period_end, rundown_text, metadata")
      .order("period_end", { ascending: false })
      .limit(1)
      .single<Announcement>(),
    supabase
      .from("parrot_announcements")
      .select("id, created_at, period_start, period_end, rundown_text, metadata")
      .order("period_end", { ascending: false })
      .limit(20),
  ]);

  const latest = latestResult.data;
  const allAnnouncements = (allResult.data ?? []) as Announcement[];
  const pastAnnouncements = latest
    ? allAnnouncements.filter((a) => a.id !== latest.id)
    : allAnnouncements;

  return (
    <div className="p-4 sm:p-6 md:p-8">
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
            <CardHeader className="border-b bg-muted/30 px-4 py-3 !pb-3">
              <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
                <Image
                  src="/assets/toucan_white.png"
                  alt="Parrott"
                  width={40}
                  height={40}
                  className="shrink-0 rounded-full"
                />
                <div className="flex flex-col gap-1">
                  <span>Parrott</span>
                  <Badge
                    variant="fresh"
                    icon={<Clock className="size-3" />}
                    className="w-fit text-[11px] font-normal"
                  >
                    {timeAgo(latest.created_at)}
                  </Badge>
                </div>
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

      {pastAnnouncements.length > 0 ? (
        <section className="mt-10">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Megaphone className="size-4" aria-hidden />
            Past announcements
          </div>

          <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
            {pastAnnouncements.map((row) => (
              <article key={row.id} className="px-4 py-3 bg-card">
                <Badge
                  variant="outline"
                  className="mb-1.5 text-[11px] font-normal text-muted-foreground"
                >
                  {formatWindow(row.period_start, row.period_end)}
                </Badge>
                <ExpandableText className="text-sm leading-relaxed text-foreground">
                  {row.rundown_text}
                </ExpandableText>
              </article>
            ))}
          </div>
        </section>
      ) : null}
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

/** Human-readable relative time, computed at render (server). */
function timeAgo(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  if (diffMs < 0) return "just now";

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes === 1) return "1 min ago";
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours === 1) return "1 hour ago";
  if (hours < 24) return `${hours} hours ago`;

  const days = Math.floor(hours / 24);
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

/** Compact date range for the announcement list chips. */
function formatWindow(start: string, end: string): string {
  try {
    const s = new Date(start);
    const e = new Date(end);

    const dateOpts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
    const timeOpts: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };

    const sameDay =
      s.getFullYear() === e.getFullYear() &&
      s.getMonth() === e.getMonth() &&
      s.getDate() === e.getDate();

    if (sameDay) {
      const date = s.toLocaleDateString(undefined, dateOpts);
      const t1 = s.toLocaleTimeString(undefined, timeOpts);
      const t2 = e.toLocaleTimeString(undefined, timeOpts);
      return `${date} · ${t1} – ${t2}`;
    }

    const fullOpts: Intl.DateTimeFormatOptions = {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    };
    return `${s.toLocaleString(undefined, fullOpts)} – ${e.toLocaleString(undefined, fullOpts)}`;
  } catch {
    return `${start} – ${end}`;
  }
}
