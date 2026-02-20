"use client";

import { useState } from "react";
import { PersonalityToneList, type ParrotTone } from "@/components/personality-tone-list";
import { PersonalityKeywordsChips } from "./personality-keywords-chips";
import { ToolDescriptionsList } from "@/components/prompt-config-lists";
import { VoiceStyleSlidersCard } from "@/components/voice-style-sliders-card";
import { RoastConfigCard } from "@/components/roast-config-card";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { MessageSquare, Wrench, ChevronRight } from "lucide-react";

type PromptSection = {
  id: string;
  slug: string;
  content: string;
  description: string | null;
};

type ToolMetaData = {
  id: string;
  tool_slug: string;
  description: string;
  is_active: boolean;
  /** When this tool was used: deliver reply as text, voice, or both. Admin-only to edit. */
  response_delivery?: string | null;
  /** Parameter name -> description (from tools_meta_data.parameter_descriptions jsonb). */
  parameter_descriptions?: Record<string, string> | null;
};

type PersonalityTabsProps = {
  tones: ParrotTone[];
  allKeywords: string[];
  promptSections: PromptSection[];
  toolDescriptions: ToolMetaData[];
  /** When set, tools fetch failed; show this message in the Prompt & tools tab. */
  toolsLoadError?: string | null;
};

const TAB_TONES = "tones";
const TAB_PROMPT_TOOLS = "prompt-tools";
const TAB_ROAST = "roast";

export function PersonalityTabs({
  tones,
  allKeywords,
  promptSections,
  toolDescriptions,
  toolsLoadError,
}: PersonalityTabsProps) {
  const [activeTab, setActiveTab] = useState(TAB_TONES);
  const perms = usePermissions();
  const hasPromptContent =
    promptSections.length > 0 ||
    toolDescriptions.length > 0 ||
    Boolean(toolsLoadError?.trim());

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
              data-testid="personality-tools-tab"
              className={`rounded-t-md border px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === TAB_PROMPT_TOOLS
                  ? "border-border border-b-transparent bg-background text-foreground -mb-px"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              Tools
            </button>
          )}
          <button
            type="button"
            onClick={() => setActiveTab(TAB_ROAST)}
            className={`rounded-t-md border px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === TAB_ROAST
                ? "border-border border-b-transparent bg-background text-foreground -mb-px"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
          >
            Roast
          </button>
        </nav>
      </div>

      {/* Tab: Tones */}
      {activeTab === TAB_TONES && (
        <div className="flex flex-col gap-4">
          <PersonalityKeywordsChips
            keywords={allKeywords}
            addEditDisabled
          />

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
              <PersonalityToneList tones={tones} canEdit={perms.canEdit} />
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
          {/* {promptSections.length > 0 && (
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
          )} */}

          {toolsLoadError?.trim() && (
            <section className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3">
              <p className="text-sm font-medium text-destructive">
                Could not load tool descriptions
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{toolsLoadError}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Check that the <code className="rounded bg-muted px-1 py-0.5 font-mono">tools_meta_data</code> table exists and RLS allows read access.
              </p>
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
              <ToolDescriptionsList tools={toolDescriptions} isAdmin={perms.isAdmin} />
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

      {/* Tab: Roast */}
      {activeTab === TAB_ROAST && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Control how often each roast type is used: message-based, game/activity-based, or
            custom (no context). The agent picks a type at random using these weights on each
            roast.
          </p>
          <RoastConfigCard canEdit={perms.canEdit} />
        </div>
      )}
    </div>
  );
}
