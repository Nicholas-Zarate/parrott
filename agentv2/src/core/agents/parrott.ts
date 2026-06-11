/**
 * Parrott — Mastra agent definition (framework-free).
 *
 * This module exports a factory function. The NestJS provider
 * (infra/parrott-agent.provider.ts) calls it with closures that resolve
 * instructions and model dynamically from PersonalityService (30–60s TTL cache).
 *
 * Boundary rule: no @nestjs/*, discord.js, or necord imports.
 */

import { Agent } from '@mastra/core/agent';
import type { ToolsInput } from '@mastra/core/agent';
import { ModelRouterLanguageModel } from '@mastra/core/llm';
import { getParrottMemory } from '../memory/index.js';

// ── Types ────────────────────────────────────────────────────────────────────

export type InstructionsFn = () => string | Promise<string>;
export type ModelFn = () =>
  | ModelRouterLanguageModel
  | Promise<ModelRouterLanguageModel>;

export interface ParrottAgentOptions {
  /** Async closure — returns the assembled system prompt (cached in PersonalityService). */
  instructions: InstructionsFn;
  /** Async closure — returns the ModelRouterLanguageModel for this turn. */
  model: ModelFn;
  /** Tool instances to register with the agent (built in Task 4). */
  tools?: ToolsInput;
}

// ── Factory ──────────────────────────────────────────────────────────────────

/**
 * Creates the Parrott Mastra agent.
 *
 * Call once at module init (NestJS provider). The instructions and model
 * closures are resolved on each turn, so personality/model changes take effect
 * within the PersonalityService cache window (~45s) without a restart.
 *
 * Tools are empty for Task 2; added in Task 4.
 */
export function createParrottAgent(options: ParrottAgentOptions): Agent {
  return new Agent({
    id: 'parrott-v2',
    name: 'Parrott',
    instructions: options.instructions,
    model: options.model,
    memory: getParrottMemory(),
    tools: options.tools ?? {},
  });
}
