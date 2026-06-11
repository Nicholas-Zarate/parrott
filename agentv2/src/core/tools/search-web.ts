/**
 * search_web tool — Tavily API web search.
 *
 * Boundary: no NestJS, no Discord imports.
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

const TAVILY_URL = 'https://api.tavily.com/search';
const MAX_RESULTS = 5;
const SNIPPET_MAX_LEN = 400;
const TIMEOUT_MS = 15_000;

export function createSearchWebTool(description: string) {
  return createTool({
    id: 'search_web',
    description,
    inputSchema: z.object({
      query: z
        .string()
        .min(1)
        .describe(
          'The search query (e.g. "current weather NYC", "who won the 2024 election")',
        ),
    }),

    execute: async (inputData) => {
      const { query } = inputData as { query: string };
      const apiKey = process.env['TAVILY_API_KEY']?.trim();
      if (!apiKey) {
        return {
          success: false,
          error:
            'Web search is not configured. Set TAVILY_API_KEY to enable research.',
          hint: 'Tell the user research is not available right now.',
        };
      }

      const q = query.trim();
      if (!q) {
        return {
          success: false,
          error: 'Search query cannot be empty.',
          hint: 'Ask the user what they want to look up.',
        };
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

      try {
        const res = await fetch(TAVILY_URL, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            query: q,
            max_results: MAX_RESULTS,
            search_depth: 'basic',
          }),
        });
        clearTimeout(timeoutId);

        if (!res.ok) {
          const body = await res.text().catch(() => '');
          let errMsg = `Tavily API error: ${res.status}`;
          try {
            const d = JSON.parse(body) as Record<string, unknown>;
            const detail = d['detail'] as Record<string, unknown> | undefined;
            errMsg = (detail?.['error'] as string) ?? (d['error'] as string) ?? errMsg;
          } catch { /* ignore */ }
          if (res.status === 401) return { success: false, error: 'Invalid Tavily API key.' };
          if (res.status === 429) return { success: false, error: 'Search rate limit reached. Try again in a moment.' };
          return { success: false, error: errMsg };
        }

        const data = await res.json() as { results?: unknown[] };
        const results = Array.isArray(data.results) ? data.results : [];
        const items = results.slice(0, MAX_RESULTS).map((r) => {
          const row = r as Record<string, unknown>;
          const content = String(row['content'] ?? row['snippet'] ?? '').slice(0, SNIPPET_MAX_LEN);
          return {
            title: String(row['title'] ?? '(no title)'),
            url: String(row['url'] ?? ''),
            content: content + (content.length >= SNIPPET_MAX_LEN ? '…' : ''),
          };
        });

        return { success: true, query: q, results: items };
      } catch (err) {
        clearTimeout(timeoutId);
        const isAbort = (err as { name?: string }).name === 'AbortError';
        return {
          success: false,
          error: isAbort ? 'Search timed out.' : ((err as Error).message || 'Search failed.'),
          hint: 'Suggest the user try again or rephrase the question.',
        };
      }
    },
  });
}
