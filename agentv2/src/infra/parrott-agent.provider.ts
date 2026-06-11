/**
 * ParrottAgentProvider — NestJS singleton that owns the Mastra Agent instance.
 *
 * Creates the agent once at module init. The instructions and model closures
 * call PersonalityService, which caches DB results for 45s — so personality/model
 * changes reach the bot within the cache window without a restart.
 *
 * Consumers inject this provider and call getAgent() to run turns.
 *
 * Usage (in mention adapter — Task 3):
 *   const agent = this.agentProvider.getAgent();
 *   const { threadId, resourceId } = buildMemoryScope(channelId, userId);
 *   const result = await agent.generate(messages, { resourceId, threadId });
 */

import {
  Injectable,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import type { Agent, ToolsInput } from '@mastra/core/agent';
import { ModelRouterLanguageModel } from '@mastra/core/llm';
import { createParrottAgent } from '../core/agents/parrott.js';
import { buildTools } from '../core/tools/index.js';
import { PersonalityService } from './personality.service.js';
import { FeatureFlagService } from './feature-flags.service.js';
import { DiscordTimerService } from './discord-timer.service.js';
import { DiscordRoastAdapter } from './discord-roast.adapter.js';

/**
 * Propagates the active guild_id through the async call stack so the
 * instructions and model closures can resolve guild-specific config
 * without changing the agent.generate() API.
 *
 * Usage in MentionService:
 *   await guildContext.run(guildId, () => agent.generate(...))
 *
 * Usage in closures:
 *   const guildId = guildContext.getStore() ?? 'default';
 */
export const guildContext = new AsyncLocalStorage<string>();

@Injectable()
export class ParrottAgentProvider implements OnModuleInit {
  private readonly logger = new Logger(ParrottAgentProvider.name);
  private agent!: Agent;

  /** Core tools built at init from DB descriptions. */
  private coreTools: ToolsInput = {};
  /**
   * Platform-specific tools registered after init (e.g. join_voice from VoiceModule).
   * Kept separate from coreTools to avoid a DI cycle: the agent provider must not
   * depend on platform modules. They register into this map; the agent's dynamic
   * tools closure merges it at turn-time.
   */
  private readonly lateTools: ToolsInput = {};

  constructor(
    private readonly personality: PersonalityService,
    private readonly flags: FeatureFlagService,
    private readonly timerService: DiscordTimerService,
    private readonly roastAdapter: DiscordRoastAdapter,
  ) {}

  async onModuleInit(): Promise<void> {
    // Build tools with live descriptions from DB
    const descriptions = await this.personality.getActiveToolDescriptions();
    this.coreTools = buildTools(descriptions, {
      timer: this.timerService,
      roastData: this.roastAdapter,
    });

    this.agent = createParrottAgent({
      // Resolved per-turn. guildContext carries the active guild_id so each
      // guild gets its own personality without separate agent instances.
      instructions: () => {
        const guildId = guildContext.getStore() ?? 'default';
        return this.personality.getSystemPrompt('text', guildId);
      },

      model: async () => {
        const guildId = guildContext.getStore() ?? 'default';
        const modelId = await this.personality.getModel(guildId);
        return new ModelRouterLanguageModel(modelId);
      },

      // Resolved per-turn so platform tools registered after init are included.
      tools: () => ({ ...this.coreTools, ...this.lateTools }),
    });

    this.logger.log(`Parrott Mastra agent initialised with ${Object.keys(this.coreTools).length} core tools`);
  }

  /**
   * Returns the singleton Agent instance.
   * Callers pass { resourceId, threadId } to agent.generate() / agent.stream()
   * to wire memory correctly.
   *
   * Memory is gated on capability.memory flag in the mention adapter (Task 3).
   */
  getAgent(): Agent {
    return this.agent;
  }

  /**
   * Register a platform-specific tool after init (e.g. join_voice from VoiceModule).
   * Avoids a DI cycle — platform modules depend on this provider, not vice versa.
   * The agent's tools closure merges these at turn-time, so registration order
   * relative to onModuleInit does not matter.
   */
  registerTool(name: string, tool: ToolsInput[string]): void {
    this.lateTools[name] = tool;
    this.logger.log(`Registered platform tool: ${name}`);
  }

  /**
   * Is the memory feature live for this guild?
   * Used by the mention adapter to decide whether to pass memory IDs.
   */
  isMemoryLive(guildId = 'default'): boolean {
    return this.flags.isLive('capability.memory', guildId);
  }
}
