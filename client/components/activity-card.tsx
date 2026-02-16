"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, MessageSquare, Mail, Mic, User } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  TRIGGER_LABELS,
  ACTIVITY_TYPE_LABELS,
  formatRelativeTime,
  messagePreview,
  formatContext,
  getTriggerExplanation,
} from "@/lib/activity-helpers";

export type ActivityRow = {
  id: string;
  guild_id: string;
  user_id: string;
  user_name: string | null;
  trigger_type: string;
  activity_name: string | null;
  activity_type: number | null;
  context: unknown;
  message: string | null;
  delivered_to: string[];
  created_at: string;
};

type ActivityCardProps = {
  activity: ActivityRow;
};

export function ActivityCard({ activity }: ActivityCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { relative, exact } = formatRelativeTime(activity.created_at);
  const preview = messagePreview(activity.message);
  const deliveredTo = Array.isArray(activity.delivered_to) ? activity.delivered_to : [];
  const triggerLabel = TRIGGER_LABELS[activity.trigger_type] ?? activity.trigger_type;
  const activityTypeLabel =
    activity.activity_type != null && ACTIVITY_TYPE_LABELS[activity.activity_type]
      ? ACTIVITY_TYPE_LABELS[activity.activity_type]
      : null;

  return (
    <Card className="overflow-hidden gap-0 py-0" data-testid="activity-card">
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        className="w-full rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-expanded={isOpen}
      >
        <CardHeader className="flex flex-col gap-1.5 border-b bg-muted/30 px-3 py-2 pe-3">
          <div className="flex min-h-0 flex-shrink-0 flex-row items-center gap-2">
            <span className="flex size-6 shrink-0 items-center justify-center text-muted-foreground">
              {isOpen ? (
                <ChevronDown className="size-4" aria-hidden />
              ) : (
                <ChevronRight className="size-4" aria-hidden />
              )}
            </span>
            <CardTitle className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-sm font-medium text-foreground">
              {activity.user_name ? (
                <Badge
                  variant="user"
                  icon={<User aria-hidden />}
                  title={`User ID: ${activity.user_id}`}
                >
                  {activity.user_name}
                </Badge>
              ) : null}
              <Badge variant="trigger" triggerType={activity.trigger_type}>
                {triggerLabel}
              </Badge>
              {activity.activity_name ? (
                <Badge variant="activity" title="Activity name">
                  {activity.activity_name}
                </Badge>
              ) : null}
              {activityTypeLabel ? (
                <Badge variant="default" className="font-mono text-[10px]">
                  {activityTypeLabel}
                </Badge>
              ) : null}
              {deliveredTo.includes("channel") ? (
                <Badge variant="channel" icon={<MessageSquare aria-hidden />} title="Sent to channel">
                  Channel
                </Badge>
              ) : null}
              {deliveredTo.includes("dm") ? (
                <Badge variant="dm" icon={<Mail aria-hidden />} title="DM sent">
                  DM
                </Badge>
              ) : null}
              {deliveredTo.includes("voice") ? (
                <Badge variant="voice" icon={<Mic aria-hidden />} title="Voice TTS">
                  Voice
                </Badge>
              ) : null}
            </CardTitle>
          </div>
          {!isOpen && preview ? (
            <p className="line-clamp-1 pl-8 text-xs text-muted-foreground">
              {preview}
            </p>
          ) : null}
          <p className="pl-8 text-xs text-muted-foreground" title={exact}>
            {relative}
          </p>
        </CardHeader>
      </button>
      {isOpen ? (
        <CardContent className="flex flex-col gap-4 px-3 py-3">
          <div>
            <p className="mb-1.5 text-xs font-bold text-foreground">
              Why was this triggered?
            </p>
            <p className="text-sm text-muted-foreground">
              {getTriggerExplanation({
                trigger_type: activity.trigger_type,
                activity_name: activity.activity_name,
                user_name: activity.user_name,
                context: activity.context,
              })}
            </p>
          </div>
          {activity.message ? (
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                Message
              </p>
              <p className="rounded border bg-muted/20 px-3 py-2 text-sm text-foreground">
                {activity.message}
              </p>
            </div>
          ) : null}
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              Context
            </p>
            <pre className="max-h-40 overflow-auto rounded border bg-muted/20 px-3 py-2 font-mono text-xs text-foreground whitespace-pre-wrap">
              {formatContext(activity.context)}
            </pre>
          </div>
          <p className="text-xs text-muted-foreground">
            Delivered to: {deliveredTo.length ? deliveredTo.join(", ") : "—"} · {exact}
          </p>
        </CardContent>
      ) : null}
    </Card>
  );
}
