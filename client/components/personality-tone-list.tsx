"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ExpandableText } from "@/components/expandable-text";
import { updateToneDescription, updateToneActive } from "@/lib/parrot-tones";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { FileText, Mic } from "lucide-react";

export type ParrotTone = {
  id: string;
  slug: string;
  task: string;
  constraints: string;
  max_words: number | null;
  description: string | null;
  is_active: boolean;
  sort_order: number | null;
  created_at: string;
  updated_at: string;
  keywords: string[] | null;
};

const SLUG_STYLE: Record<string, "default" | "voice" | "outline"> = {
  text: "default",
  vc: "voice",
};

const SYSTEM_PROMPT_SLUGS = new Set(["role", "voice"]);
const RESPONSE_TONE_SLUGS = new Set(["text", "vc"]);

function partitionTones(tones: ParrotTone[]) {
  const systemPromptBlocks = tones.filter((t) => SYSTEM_PROMPT_SLUGS.has(t.slug));
  const responseTones = tones.filter((t) => RESPONSE_TONE_SLUGS.has(t.slug));
  const other = tones.filter(
    (t) => !SYSTEM_PROMPT_SLUGS.has(t.slug) && !RESPONSE_TONE_SLUGS.has(t.slug)
  );
  return { systemPromptBlocks, responseTones, other };
}

function getToneTypeLabel(slug: string): string {
  if (slug === "vc") return "Voice channel";
  if (slug === "role") return "Role";
  if (slug === "voice") return "Voice style";
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}

function formatRelative(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const diffMs = Date.now() - d.getTime();
    const days = Math.floor(diffMs / 86_400_000);
    if (days < 1) return "today";
    if (days === 1) return "yesterday";
    if (days < 7) return `${days} days ago`;
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

type Props = {
  tones: ParrotTone[];
  canEdit?: boolean;
};

function ToneRow({
  tone,
  onView,
  canEdit,
  onToggleActive,
}: {
  tone: ParrotTone;
  onView: (tone: ParrotTone) => void;
  canEdit?: boolean;
  onToggleActive?: (tone: ParrotTone, is_active: boolean) => void;
}) {
  const isMediaTone = RESPONSE_TONE_SLUGS.has(tone.slug);
  const showEnabledSwitch = isMediaTone && canEdit && onToggleActive != null;

  return (
    <li className="flex flex-wrap items-center gap-2 px-4 py-3 bg-card hover:bg-muted/30 transition-colors">
      <span className="font-medium text-foreground min-w-[7rem]">
        {tone.slug === "vc" ? (
          <span className="flex items-center gap-1.5">
            <Mic className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            {getToneTypeLabel(tone.slug)}
          </span>
        ) : SYSTEM_PROMPT_SLUGS.has(tone.slug) ? (
          <span className="flex items-center gap-1.5">
            <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            {getToneTypeLabel(tone.slug)}
          </span>
        ) : (
          getToneTypeLabel(tone.slug)
        )}
      </span>
      <div className="flex flex-1 flex-wrap items-center gap-1.5">
        {SYSTEM_PROMPT_SLUGS.has(tone.slug) && (
          <Badge variant="outline" className="text-[10px]">
            System prompt block
          </Badge>
        )}
        {!tone.is_active && (
          <Badge variant="outline" className="text-[10px]">
            Inactive
          </Badge>
        )}
        {tone.max_words != null && (
          <Badge
            variant={SLUG_STYLE[tone.slug] ?? "outline"}
            className="text-[10px]"
          >
            max {tone.max_words} words
          </Badge>
        )}
        {Array.isArray(tone.keywords) &&
          tone.keywords.slice(0, 4).map((kw) => (
            <Badge
              key={kw}
              variant="outline"
              className="text-[10px] capitalize"
            >
              {kw.replace(/-/g, " ")}
            </Badge>
          ))}
        {Array.isArray(tone.keywords) && tone.keywords.length > 4 && (
          <Badge variant="outline" className="text-[10px]">
            +{tone.keywords.length - 4}
          </Badge>
        )}
      </div>
      {showEnabledSwitch && (
        <div className="flex shrink-0 items-center gap-2">
          <Switch
            id={`tone-active-${tone.id}`}
            checked={tone.is_active}
            onCheckedChange={(checked) => onToggleActive?.(tone, checked)}
            aria-label={`${tone.is_active ? "Disable" : "Enable"} ${getToneTypeLabel(tone.slug)}`}
          />
          <Label htmlFor={`tone-active-${tone.id}`} className="text-xs text-muted-foreground cursor-pointer">
            {tone.is_active ? "Enabled" : "Disabled"}
          </Label>
        </div>
      )}
      <Button
        variant="outline"
        size="sm"
        className="shrink-0 bg-orange-300 hover:bg-orange-100"
        onClick={() => onView(tone)}
        aria-label={`View ${getToneTypeLabel(tone.slug)} details`}
      >
        View
      </Button>
    </li>
  );
}

export function PersonalityToneList({ tones, canEdit = false }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<ParrotTone | null>(null);
  const [draftDescription, setDraftDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const { systemPromptBlocks, responseTones, other } = useMemo(
    () => partitionTones(tones),
    [tones]
  );

  // Keep selected in sync with tones (e.g. after router.refresh())
  useEffect(() => {
    if (!selected) return;
    const updated = tones.find((t) => t.id === selected.id);
    if (updated) setSelected(updated);
  }, [tones]);

  const openDrawer = (tone: ParrotTone) => {
    setSelected(tone);
    setDraftDescription(tone.description ?? "");
    setOpen(true);
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setSelected(null);
      setDraftDescription("");
    }
  };

  const handleSaveDescription = async () => {
    if (!selected) return;
    setSaving(true);
    const value = draftDescription.trim() || null;
    const { error, updated_at } = await updateToneDescription(selected.id, value);
    setSaving(false);
    if (error) {
      toast.error("Failed to update description: " + error);
      return;
    }
    toast.success("Description updated.");
    setSelected((prev) =>
      prev ? { ...prev, description: value, updated_at: updated_at ?? prev.updated_at } : null
    );
    router.refresh();
  };

  const handleToggleActive = async (tone: ParrotTone, is_active: boolean) => {
    const { error } = await updateToneActive(tone.id, is_active);
    if (error) {
      const isForbiddenOrNotFound = error.includes("no effect");
      const isNoSession = error.includes("No session");
      const message = isNoSession
        ? "Your sign-in wasn’t sent with this action. Sign in again with Discord and try again."
        : isForbiddenOrNotFound
          ? "You don't have permission to change this. Ask an admin for the Editor role in Settings → Team."
          : "Failed to update: " + error;
      toast.error(message);
      return;
    }
    if (tone.slug === "text" && !is_active) {
      toast.success("Text media disabled. The parrot won't reply to @mentions until Text is enabled again.");
    } else {
      toast.success(is_active ? "Media enabled." : "Media disabled.");
    }
    router.refresh();
  };

  return (
    <>
      <div className="space-y-8">
        {/* System prompt blocks: who the parrot is and how it sounds in the prompt */}
        {systemPromptBlocks.length > 0 && (
          <section>
            <div className="mb-2">
              <h2 className="text-sm font-semibold text-foreground">
                System prompt blocks
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Who the parrot is and how it sounds in the system prompt. Used as fixed blocks (Role, Voice style).
              </p>
            </div>
            <ul className="divide-y divide-border rounded-lg border border-border overflow-hidden">
              {systemPromptBlocks.map((tone) => (
                <ToneRow key={tone.id} tone={tone} onView={openDrawer} />
              ))}
            </ul>
          </section>
        )}

        {/* Response tones: how the parrot replies in chat vs in voice channel */}
        {responseTones.length > 0 && (
          <section>
            <div className="mb-2">
              <h2 className="text-sm font-semibold text-foreground">
                Response tones
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                How the parrot replies: text chat (word limits, style) and voice channel (TTS).
              </p>
              {!canEdit && (
                <p className="text-xs text-muted-foreground mt-1">
                  Ask an admin for editor permissions to enable or disable text or voice tones.
                </p>
              )}
            </div>
            <ul className="divide-y divide-border rounded-lg border border-border overflow-hidden">
              {responseTones.map((tone) => (
                <ToneRow
                  key={tone.id}
                  tone={tone}
                  onView={openDrawer}
                  canEdit={canEdit}
                  onToggleActive={handleToggleActive}
                />
              ))}
            </ul>
          </section>
        )}

        {/* Any other slugs from the DB */}
        {other.length > 0 && (
          <section>
            <div className="mb-2">
              <h2 className="text-sm font-semibold text-foreground">
                Other
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Tones that are not system prompt blocks or response tones.
              </p>
            </div>
            <ul className="divide-y divide-border rounded-lg border border-border overflow-hidden">
              {other.map((tone) => (
                <ToneRow key={tone.id} tone={tone} onView={openDrawer} />
              ))}
            </ul>
          </section>
        )}
      </div>

      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent
          side="right"
          className="flex w-full flex-col sm:max-w-lg overflow-y-auto"
        >
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="flex flex-wrap items-center gap-2">
                  {selected.slug === "vc" ? (
                    <span className="flex items-center gap-1.5">
                      <Mic className="size-4" aria-hidden />
                      Voice channel
                    </span>
                  ) : SYSTEM_PROMPT_SLUGS.has(selected.slug) ? (
                    <span className="flex items-center gap-1.5">
                      <FileText className="size-4" aria-hidden />
                      {selected.slug === "role" ? "Role" : "Voice style"}
                    </span>
                  ) : (
                    getToneTypeLabel(selected.slug)
                  )}
                  {SYSTEM_PROMPT_SLUGS.has(selected.slug) && (
                    <Badge variant="outline" className="text-xs font-normal">
                      System prompt block
                    </Badge>
                  )}
                  {!selected.is_active && (
                    <Badge variant="outline" className="text-xs">
                      Inactive
                    </Badge>
                  )}
                  {selected.max_words != null && (
                    <Badge
                      variant={SLUG_STYLE[selected.slug] ?? "outline"}
                      className="text-xs"
                    >
                      max {selected.max_words} words
                    </Badge>
                  )}
                </SheetTitle>
                {!canEdit && selected.description?.trim() && (
                  <p className="text-sm text-muted-foreground pt-1">
                    {selected.description}
                  </p>
                )}
              </SheetHeader>
              <div className="flex flex-1 flex-col gap-6 px-4 pb-6">
                <div>
                  <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">
                    Description
                  </h3>
                  {canEdit ? (
                    <>
                      <textarea
                        value={draftDescription}
                        onChange={(e) => setDraftDescription(e.target.value)}
                        placeholder="Short description of this tone (optional)"
                        rows={3}
                        className="border-input placeholder:text-muted-foreground w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                        aria-label="Tone description"
                      />
                      <Button
                        size="sm"
                        className="mt-2"
                        onClick={handleSaveDescription}
                        disabled={saving || (draftDescription.trim() || null) === (selected.description?.trim() || null)}
                      >
                        {saving ? "Saving…" : "Save description"}
                      </Button>
                    </>
                  ) : (
                    <p className="text-sm leading-relaxed text-foreground">
                      {selected.description?.trim() || "—"}
                    </p>
                  )}
                </div>
                <div>
                  <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Task
                  </h3>
                  <ExpandableText className="mt-1 text-sm leading-relaxed text-foreground">
                    {selected.task || "—"}
                  </ExpandableText>
                </div>
                <div>
                  <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Constraints
                  </h3>
                  <ExpandableText className="mt-1 text-sm leading-relaxed text-foreground">
                    {selected.constraints || "—"}
                  </ExpandableText>
                </div>
                {Array.isArray(selected.keywords) &&
                  selected.keywords.length > 0 && (
                    <div>
                      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
                        Keywords
                      </h3>
                      <div className="flex flex-wrap gap-1.5">
                        {selected.keywords.map((kw) => (
                          <Badge
                            key={kw}
                            variant="outline"
                            className="text-[10px] capitalize"
                          >
                            {kw.replace(/-/g, " ")}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                <p className="text-xs text-muted-foreground mt-auto">
                  Updated {formatRelative(selected.updated_at)}
                </p>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
