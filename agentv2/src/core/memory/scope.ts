/**
 * Memory scope helpers — pure functions, no DB connection required.
 * Kept separate so tests can import without needing DATABASE_URL.
 *
 * See docs/memory-plan.md § Scope decision:
 *   threadId   = discord:${channelId}  — shared channel conversation
 *   resourceId = discord:${userId}     — per-user working memory
 */

/**
 * Build the Discord-scoped IDs used for all Mastra memory calls.
 * Pass both to agent.generate() / agent.stream() to wire memory correctly.
 */
export function buildMemoryScope(
  channelId: string,
  userId: string,
): { threadId: string; resourceId: string } {
  return {
    threadId: `discord:${channelId}`,
    resourceId: `discord:${userId}`,
  };
}
