/**
 * Personality formatting — pure functions, no framework imports.
 *
 * Replaces v1's flat space-join (agent/config/parrot.js buildSystemPrompt) with
 * structured markdown sections. Clear boundaries compose well with Mastra's
 * memory blocks.
 *
 * Boundary rule: this file must never import from @nestjs/*, discord.js, or necord.
 */

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * A row from parrot_tones.
 * `roleName` = the tone profile identifier (e.g., 'default') — NOT the identity
 * section of the prompt.
 * `voice`, `text`, `vc` = context-specific personality text.
 */
export interface ToneRow {
  roleName: string; // DB column: role (the profile name, e.g., 'default')
  voice: string;    // DB column: voice — personality text for voice channels
  text: string;     // DB column: text  — personality text for text channels
  vc: string;       // DB column: vc    — personality text for VC override (may be empty)
}

/** A row from parrot_prompt_sections. */
export interface PromptSectionRow {
  key: string;       // stable slug, e.g., 'tools', 'rules'
  content: string;   // markdown content — may already include ## headers
  enabled: boolean;
  sort_order: number;
}

/** A row from tools_meta_data. */
export interface ToolMetaRow {
  tool_slug: string;
  description: string;
  is_active: boolean;
}

/** Which interaction context is active this turn. */
export type PersonalityContext = 'text' | 'voice' | 'vc';

export interface PersonalityInput {
  tone: ToneRow;
  sections: PromptSectionRow[];
  tools: ToolMetaRow[];
  context?: PersonalityContext;
}

// ── Working-memory guidance ──────────────────────────────────────────────────

/**
 * Injected into every prompt so the model knows when to call updateWorkingMemory.
 * Derived from tools/remember/remember.md.
 */
const MEMORY_GUIDANCE = `## Memory
You have persistent working memory. Use it selectively to remember things that increase belonging, inside-joke payoff, or relevance in future turns.

Remember (prioritised):
1. Names, nicknames, pronouns, preferences ("hates spoilers", "plays on console", timezone)
2. Server slang, inside jokes and their triggers, running callbacks
3. Plans/commitments ("raid Saturday"), ongoing games/shows/drama
4. Who's close with whom; sensitivities; recurring patterns
5. Concrete facts that improve your next answer; corrections you received

Skip: generic small talk, one-off throwaway lines, sensitive details unless clearly shared group context, things that change constantly.

When you store something, keep it short, scoped, and neutral — key fact or phrase, not the whole conversation.`;

// ── Formatter ────────────────────────────────────────────────────────────────

/**
 * Converts raw personality rows into a structured markdown system prompt.
 *
 * Structure:
 *   {tone text for context — no header, acts as the opener}
 *
 *   {each enabled section, sorted by sort_order — sections include their own ## headers}
 *
 *   ## Tools (active tools, only if no 'tools' key in sections)
 *
 *   ## Memory (working-memory guidance — always appended)
 *
 * ⚠️ Behaviour-change note: this changes the exact prompt vs v1's space-join.
 *    Eyeball representative replies to confirm personality still feels right.
 */
export function formatPersonalityMarkdown(input: PersonalityInput): string {
  const { tone, sections, tools, context = 'text' } = input;
  const parts: string[] = [];

  // Opening personality text — context-specific, no header (it sets the voice).
  const personalityText =
    context === 'vc'
      ? (tone.vc || tone.voice || tone.text)
      : context === 'voice'
      ? (tone.voice || tone.text)
      : tone.text;

  if (personalityText?.trim()) {
    parts.push(personalityText.trim());
  }

  // Enabled prompt sections, sorted. Their content already contains ## headers.
  const enabledSections = [...sections]
    .filter((s) => s.enabled && s.content?.trim())
    .sort((a, b) => a.sort_order - b.sort_order);

  for (const section of enabledSections) {
    parts.push(section.content.trim());
  }

  // Fallback tool list — only when no 'tools' section in prompt_sections.
  const hasToolsSection = enabledSections.some((s) => s.key === 'tools');
  if (!hasToolsSection) {
    const activeTools = tools.filter((t) => t.is_active);
    if (activeTools.length > 0) {
      const lines = activeTools
        .map((t) => `- **${t.tool_slug}**: ${t.description}`)
        .join('\n');
      parts.push(`## Tools\n${lines}`);
    }
  }

  // Always append working-memory guidance.
  parts.push(MEMORY_GUIDANCE);

  return parts.join('\n\n');
}
