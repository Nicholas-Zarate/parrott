import { createClient } from "@/lib/supabase/server";
import { PersonalityTabs } from "@/components/personality-tabs";
import type { ParrotTone } from "@/components/personality-tone-list";

export const dynamic = "force-dynamic";

const TABLE_TONES = "parrot_tones";
const TABLE_PROMPT_SECTIONS = "parrot_prompt_sections";
const TABLE_TOOL_DESCRIPTIONS = "parrot_tool_descriptions";

export default async function PersonalityPage() {
  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from(TABLE_TONES)
    .select(
      "id, slug, task, constraints, max_words, description, is_active, sort_order, created_at, updated_at, keywords"
    )
    .order("sort_order", { ascending: true, nullsFirst: false });

  if (error) {
    const isMissingTable =
      error.message?.includes("schema cache") ||
      error.message?.includes("could not find the table") ||
      error.message?.includes("relation \"parrot_tones\" does not exist");
    return (
      <div className="p-4 sm:p-6 md:p-8">
        <h1 className="text-2xl font-semibold text-foreground">Personality</h1>
        {isMissingTable ? (
          <>
            <p className="mt-4 text-muted-foreground">
              The <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">parrot_tones</code> table
              does not exist in this Supabase project yet.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Run{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">agent/supabase/bootstrap_parrot_tones.sql</code>{" "}
              in the Supabase SQL Editor (Dashboard → SQL Editor → New query → paste and Run), or run migrations
              001, 015, and 016 in order.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Raw error: {error.message}
            </p>
          </>
        ) : (
          <p className="mt-4 text-destructive">
            Failed to load personality: {error.message}
          </p>
        )}
      </div>
    );
  }

  const tones = (rows ?? []) as ParrotTone[];
  const allKeywords = Array.from(
    new Set(tones.flatMap((t) => t.keywords ?? []))
  ).filter(Boolean).sort();

  const [sectionsResult, toolsResult] = await Promise.all([
    supabase.from(TABLE_PROMPT_SECTIONS).select("id, slug, content, description").eq("is_active", true).order("sort_order", { ascending: true, nullsFirst: false }),
    supabase.from(TABLE_TOOL_DESCRIPTIONS).select("id, tool_slug, description, is_active"),
  ]);
  const promptSections = sectionsResult.error ? [] : (sectionsResult.data ?? []);
  const toolDescriptions = toolsResult.error ? [] : (toolsResult.data ?? []);

  return (
    <div className="p-4 sm:p-6 md:p-8">
      <PersonalityTabs
        tones={tones}
        allKeywords={allKeywords}
        promptSections={promptSections as { id: string; slug: string; content: string; description: string | null }[]}
        toolDescriptions={toolDescriptions as { id: string; tool_slug: string; description: string; is_active: boolean }[]}
      />
    </div>
  );
}
