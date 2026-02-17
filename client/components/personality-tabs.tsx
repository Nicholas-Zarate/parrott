"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { PersonalityToneList, type ParrotTone } from "@/components/personality-tone-list";
import { PromptSectionsList, ToolDescriptionsList } from "@/components/prompt-config-lists";
import { VoiceStyleSlidersCard } from "@/components/voice-style-sliders-card";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { MessageSquare, Sparkles, FileText, Wrench, ChevronRight } from "lucide-react";

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
};

type PersonalityTabsProps = {
  tones: ParrotTone[];
  allKeywords: string[];
  promptSections: PromptSection[];
  toolDescriptions: ToolDescription[];
};

const TAB_TONES = "tones";
const TAB_PROMPT_TOOLS = "prompt-tools";

export function PersonalityTabs({
  tones,
  allKeywords,
  promptSections,
  toolDescriptions,
}: PersonalityTabsProps) {
  const [activeTab, setActiveTab] = useState(TAB_TONES);
  const perms = usePermissions();
  const hasPromptContent = promptSections.length > 0 || toolDescriptions.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          Personality
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Read-only view of parrot tone records from the database. When{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
            PARROT_TONES_SOURCE=supabase
          </code>
          , the agent uses these tones. Run migration 015 to add keyword badges and sync personality text.
        </p>
      </div>

      {/* Tab bar */}
      <div className="border-b border-border">
        <nav className="flex gap-1" aria-label="Personality sections">
          <button
            type="button"
            onClick={() => setActiveTab(TAB_TONES)}
            className={`rounded-t-md border px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === TAB_TONES
                ? "border-border border-b-transparent bg-background text-foreground -mb-px"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
          >
            Tones
          </button>
          {hasPromptContent && (
            <button
              type="button"
              onClick={() => setActiveTab(TAB_PROMPT_TOOLS)}
              className={`rounded-t-md border px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === TAB_PROMPT_TOOLS
                  ? "border-border border-b-transparent bg-background text-foreground -mb-px"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              Prompt & tools
            </button>
          )}
        </nav>
      </div>

      {/* Tab: Tones */}
      {activeTab === TAB_TONES && (
        <div className="flex flex-col gap-4">
          {allKeywords.length > 0 && (
            <section className="rounded-lg border border-border bg-muted/20 px-4 py-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Sparkles className="size-4" aria-hidden />
                Personality keywords
              </div>
              <div className="flex flex-wrap gap-2">
                {allKeywords.map((kw) => (
                  <Badge
                    key={kw}
                    variant="outline"
                    className="capitalize"
                  >
                    {kw.replace(/-/g, " ")}
                  </Badge>
                ))}
              </div>
            </section>
          )}

          <section>
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <MessageSquare className="size-4" aria-hidden />
              Tone records
            </div>
            {tones.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No personality records in the database yet. Run the{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                  parrot_tones
                </code>{" "}
                migrations to seed defaults.
              </p>
            ) : (
              <PersonalityToneList tones={tones} />
            )}
          </section>

          {/* Collapsible: Voice style sliders (global) */}
          <details className="group rounded-lg border border-border bg-card">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-foreground hover:bg-muted/50 [&::-webkit-details-marker]:hidden">
              <ChevronRight className="size-4 shrink-0 transition-transform group-open:rotate-90" aria-hidden />
              Voice style sliders
            </summary>
            <div className="border-t border-border px-4 py-3">
              <p className="mb-3 text-xs text-muted-foreground">
                Weights fine-tune how much the parrot leans into each trait. Save to apply; the agent picks them up on next config refresh or restart.
              </p>
              <VoiceStyleSlidersCard
                scope="global"
                title="Global voice style"
                description="Weights applied after the Voice block in the system prompt. Use for general tone."
                canEdit={perms.canEdit}
              />
            </div>
          </details>
        </div>
      )}

      {/* Tab: Prompt & tools */}
      {activeTab === TAB_PROMPT_TOOLS && hasPromptContent && (
        <div className="flex flex-col gap-6">
          {promptSections.length > 0 && (
            <section>
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <FileText className="size-4" aria-hidden />
                Prompt sections
              </div>
              <p className="mb-2 text-xs text-muted-foreground">
                Freeform prompt blocks (e.g. tools section). Used when PARROT_TONES_SOURCE=supabase.
              </p>
              <PromptSectionsList sections={promptSections} />
            </section>
          )}

          {toolDescriptions.length > 0 && (
            <section>
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Wrench className="size-4" aria-hidden />
                Tool descriptions
              </div>
              <p className="mb-2 text-xs text-muted-foreground">
                Per-tool description text shown to the model. Used when PARROT_TONES_SOURCE=supabase.
              </p>
              <ToolDescriptionsList tools={toolDescriptions} />
            </section>
          )}

          {/* Collapsible: When using tools (voice style sliders) */}
          <details className="group rounded-lg border border-border bg-card">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-foreground hover:bg-muted/50 [&::-webkit-details-marker]:hidden">
              <ChevronRight className="size-4 shrink-0 transition-transform group-open:rotate-90" aria-hidden />
              Voice style when using tools
            </summary>
            <div className="border-t border-border px-4 py-3">
              <p className="mb-3 text-xs text-muted-foreground">
                Tone weights applied after the tools section (when confirming after polls, roasts, timer, voice, echo, search). Save to apply.
              </p>
              <VoiceStyleSlidersCard
                scope="tools"
                title="When using tools"
                description="Weights applied after the tools section. Leave at default to match global."
                canEdit={perms.canEdit}
              />
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
