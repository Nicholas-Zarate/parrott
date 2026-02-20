"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { ExpandableText } from "@/components/expandable-text";
import { createClient } from "@/lib/supabase/client";

type PromptSection = {
  id: string;
  slug: string;
  content: string;
  description: string | null;
};

type ToolDescription = {
  id: string;
  tool_slug: string;
  description: string;
  is_active: boolean;
  /** When this tool was used: deliver reply as text, voice (TTS), or both. Admin-only to edit. */
  response_delivery?: string | null;
  /** Parameter name -> description (from tools_meta_data.parameter_descriptions jsonb). */
  parameter_descriptions?: Record<string, string> | null;
};

export function PromptSectionsList({ sections }: { sections: PromptSection[] }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<PromptSection | null>(null);

  if (sections.length === 0) return null;

  return (
    <>
      <ul className="divide-y divide-border rounded-lg border border-border overflow-hidden">
        {sections.map((s) => (
          <li
            key={s.id}
            className="flex flex-wrap items-center gap-2 px-4 py-3 bg-card hover:bg-muted/30 transition-colors"
          >
            <span className="font-medium text-foreground min-w-[6rem]">{s.slug}</span>
            <span className="flex-1 min-w-0 text-sm text-muted-foreground truncate max-w-md">
              {(s.content || "").slice(0, 80)}
              {(s.content || "").length > 80 ? "…" : ""}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="ml-auto shrink-0 bg-orange-300 hover:bg-orange-100"
              onClick={() => {
                setSelected(s);
                setOpen(true);
              }}
              aria-label={`View ${s.slug} content`}
            >
              View
            </Button>
          </li>
        ))}
      </ul>
      <Sheet open={open} onOpenChange={(next) => { setOpen(next); if (!next) setSelected(null); }}>
        <SheetContent side="right" className="flex w-full flex-col sm:max-w-lg overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>Prompt section: {selected.slug}</SheetTitle>
                {selected.description?.trim() && (
                  <p className="text-sm text-muted-foreground">{selected.description}</p>
                )}
              </SheetHeader>
              <div className="px-4 pb-6">
                <ExpandableText className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                  {selected.content || "—"}
                </ExpandableText>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

export type ResponseDelivery = "text" | "voice" | "both";

function responseDeliveryLabel(value: string): string {
  if (value === "voice") return "Voice";
  if (value === "both") return "Text + voice";
  return "Text";
}

function deliveryToToggles(value: string): { text: boolean; voice: boolean } {
  if (value === "voice") return { text: false, voice: true };
  if (value === "both") return { text: true, voice: true };
  return { text: true, voice: false };
}

function togglesToDelivery(text: boolean, voice: boolean): ResponseDelivery {
  if (text && voice) return "both";
  if (voice) return "voice";
  return "text";
}

export function ToolDescriptionsList({
  tools,
  isAdmin = false,
}: {
  tools: ToolDescription[];
  isAdmin?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<ToolDescription | null>(null);
  const [saving, setSaving] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  const getResponseDelivery = (t: ToolDescription) =>
    overrides[t.tool_slug] ?? t.response_delivery ?? "text";

  const setResponseDelivery = async (toolSlug: string, value: ResponseDelivery) => {
    if (!isAdmin || saving) return;
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("update_tool_response_delivery", {
      p_tool_slug: toolSlug,
      p_response_delivery: value,
    });
    setSaving(false);
    if (error) {
      console.error("[ToolDescriptionsList] RPC error:", error.message);
      return;
    }
    setOverrides((prev) => ({ ...prev, [toolSlug]: value }));
  };

  if (tools.length === 0) return null;

  return (
    <>
      <ul className="divide-y divide-border rounded-lg border border-border overflow-hidden">
        {tools.map((t) => (
          <li
            key={t.id}
            className={`flex flex-wrap items-center gap-2 px-4 py-3 transition-colors ${t.is_active ? "bg-card hover:bg-muted/30" : "bg-muted/20 hover:bg-muted/40"}`}
          >
            <Badge variant="outline" className="font-mono text-xs">
              {t.tool_slug}
            </Badge>
            <Badge variant={t.is_active ? "default" : "presence"} className="shrink-0 text-xs">
              {t.is_active ? "Enabled" : "Disabled"}
            </Badge>
            {isAdmin ? (
              <div className="flex items-center gap-3 shrink-0">
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                  <Switch
                    checked={deliveryToToggles(getResponseDelivery(t)).text}
                    onCheckedChange={(checked) => {
                      const { voice } = deliveryToToggles(getResponseDelivery(t));
                      setResponseDelivery(t.tool_slug, togglesToDelivery(checked, voice));
                    }}
                    disabled={saving}
                  />
                  <span>Text</span>
                </label>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                  <Switch
                    checked={deliveryToToggles(getResponseDelivery(t)).voice}
                    onCheckedChange={(checked) => {
                      const { text } = deliveryToToggles(getResponseDelivery(t));
                      setResponseDelivery(t.tool_slug, togglesToDelivery(text, checked));
                    }}
                    disabled={saving}
                  />
                  <span>Voice</span>
                </label>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground shrink-0">
                {responseDeliveryLabel(getResponseDelivery(t))}
              </span>
            )}
            <span className="flex-1 min-w-0 text-sm text-muted-foreground truncate max-w-md">
              {(t.description || "").slice(0, 80)}
              {(t.description || "").length > 80 ? "…" : ""}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="ml-auto shrink-0 bg-orange-300 hover:bg-orange-100"
              onClick={() => {
                setSelected(t);
                setOpen(true);
              }}
              aria-label={`View ${t.tool_slug} description`}
            >
              View
            </Button>
          </li>
        ))}
      </ul>
      <Sheet open={open} onOpenChange={(next) => { setOpen(next); if (!next) setSelected(null); }}>
        <SheetContent side="right" className="flex w-full flex-col sm:max-w-lg overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="font-mono text-base">Tool: {selected.tool_slug}</SheetTitle>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  <Badge variant={selected.is_active ? "default" : "presence"}>
                    {selected.is_active ? "Enabled" : "Disabled"}
                  </Badge>
                  {isAdmin ? (
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <Switch
                          checked={deliveryToToggles(getResponseDelivery(selected)).text}
                          onCheckedChange={(checked) => {
                            const { voice } = deliveryToToggles(getResponseDelivery(selected));
                            setResponseDelivery(selected.tool_slug, togglesToDelivery(checked, voice));
                          }}
                          disabled={saving}
                        />
                        <span>Text</span>
                      </label>
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <Switch
                          checked={deliveryToToggles(getResponseDelivery(selected)).voice}
                          onCheckedChange={(checked) => {
                            const { text } = deliveryToToggles(getResponseDelivery(selected));
                            setResponseDelivery(selected.tool_slug, togglesToDelivery(text, checked));
                          }}
                          disabled={saving}
                        />
                        <span>Voice</span>
                      </label>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Response: {responseDeliveryLabel(getResponseDelivery(selected))}
                    </span>
                  )}
                </div>
              </SheetHeader>
              <div className="px-4 pb-6">
                <ExpandableText className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                  {selected.description || "—"}
                </ExpandableText>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
