/**
 * sing_song tool — fetch song lyrics via Tavily and return them as text.
 *
 * Voice delivery (joining VC + TTS) is implemented in Task 5.
 * For Task 4 the tool returns the lyrics so the agent can present them in text.
 *
 * Boundary: no NestJS, no Discord imports.
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

const TAVILY_URL = 'https://api.tavily.com/search';
const TIMEOUT_MS = 12_000;
const LYRICS_MAX_LEN = 600;

async function fetchLyrics(
  songQuery: string,
  apiKey: string,
): Promise<{ success: true; lyrics: string } | { success: false; error: string }> {
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
        query: `${songQuery} lyrics verse`,
        max_results: 3,
        search_depth: 'basic',
      }),
    });
    clearTimeout(timeoutId);

    if (!res.ok) return { success: false, error: `Lyrics search failed (${res.status}).` };

    const data = await res.json() as { results?: unknown[] };
    const results = Array.isArray(data.results) ? data.results : [];

    for (const r of results) {
      const row = r as Record<string, unknown>;
      const content = String(row['content'] ?? row['snippet'] ?? '').trim();
      if (content.length > 40) {
        return {
          success: true,
          lyrics: content.slice(0, LYRICS_MAX_LEN) + (content.length > LYRICS_MAX_LEN ? '…' : ''),
        };
      }
    }

    return { success: false, error: "Couldn't find lyrics for that song." };
  } catch (err) {
    clearTimeout(timeoutId);
    const isAbort = (err as { name?: string }).name === 'AbortError';
    return {
      success: false,
      error: isAbort ? 'Lyrics search timed out.' : ((err as Error).message || 'Lyrics search failed.'),
    };
  }
}

export function createSingSongTool(description: string) {
  return createTool({
    id: 'sing_song',
    description,
    inputSchema: z.object({
      songQuery: z
        .string()
        .min(1)
        .describe(
          'The song name or title the user asked to sing (e.g. "Never Gonna Give You Up").',
        ),
    }),

    execute: async (inputData) => {
      const { songQuery } = inputData as { songQuery: string };
      const apiKey = process.env['TAVILY_API_KEY']?.trim();

      if (!apiKey) {
        return {
          success: false,
          error: 'Web search not configured — cannot look up lyrics. Set TAVILY_API_KEY.',
        };
      }

      const result = await fetchLyrics(songQuery.trim(), apiKey);
      if (!result.success) return { success: false, error: result.error };

      // Task 5 will add voice delivery. For now, return lyrics for text reply.
      return {
        success: true,
        lyrics: result.lyrics,
        note: 'Voice delivery coming in Task 5.',
      };
    },
  });
}
