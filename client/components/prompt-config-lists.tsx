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
import { ExpandableText } from "@/components/expandable-text";

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

export function ToolDescriptionsList({ tools }: { tools: ToolDescription[] }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<ToolDescription | null>(null);

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
            <Badge variant={t.is_active ? "default" : "secondary"} className="shrink-0 text-xs">
              {t.is_active ? "Enabled" : "Disabled"}
            </Badge>
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
                <Badge variant={selected.is_active ? "default" : "secondary"} className="w-fit mt-1">
                  {selected.is_active ? "Enabled" : "Disabled"}
                </Badge>
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
