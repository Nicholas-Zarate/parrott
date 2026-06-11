/**
 * Core tools barrel.
 *
 * buildTools() is called by ParrottAgentProvider at module init.
 * Descriptions come from the live tools_meta_data DB rows (via PersonalityService).
 * Port implementations are injected from infra/.
 *
 * Boundary: this file may not import NestJS or Discord.
 */

export { createSearchWebTool } from './search-web.js';
export { createSingSongTool } from './sing-song.js';
export { createTimerTool, type TimerPort, type TimerOpts } from './create-timer.js';
export { createRunRoastTool, type RoastDataPort } from './run-roast.js';
export { createMakeJokeLikeTool } from './make-joke-like.js';

import type { ToolsInput } from '@mastra/core/agent';
import { createSearchWebTool } from './search-web.js';
import { createSingSongTool } from './sing-song.js';
import { createTimerTool, type TimerPort } from './create-timer.js';
import { createRunRoastTool, type RoastDataPort } from './run-roast.js';
import { createMakeJokeLikeTool } from './make-joke-like.js';

export interface ToolPorts {
  timer: TimerPort;
  roastData: RoastDataPort;
}

/**
 * Build all active Parrott tools.
 *
 * @param descriptions  Map of tool_slug → description from tools_meta_data.
 *                      Falls back to a sensible default if the slug is absent.
 * @param ports         Platform-specific adapters (Discord delivery, etc.)
 */
export function buildTools(
  descriptions: Map<string, string>,
  ports: ToolPorts,
): ToolsInput {
  function desc(slug: string, fallback: string): string {
    return descriptions.get(slug) ?? fallback;
  }

  return {
    search_web: createSearchWebTool(
      desc('search_web', 'Search the internet for current information.'),
    ),
    sing_song: createSingSongTool(
      desc('sing_song', 'Look up and perform a song.'),
    ),
    create_timer: createTimerTool(
      desc('create_timer', 'Set a countdown timer.'),
      ports.timer,
    ),
    run_roast: createRunRoastTool(
      desc('run_roast', 'Roast a crew member.'),
      ports.roastData,
    ),
    make_joke_like: createMakeJokeLikeTool(
      desc('make_joke_like', 'Tell a joke in the style of a comedian.'),
    ),
  };
}
