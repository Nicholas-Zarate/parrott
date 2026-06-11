/**
 * make_joke_like tool — fetch a joke in the style of a comedian.
 *
 * Port of v1's get-joke.js. Two paths:
 *   Transcript subjects (Tom Segura, Kill Tony): Tavily YouTube search → fetch
 *   transcripts → pick a candidate segment.
 *   Other subjects: Tavily comedy search → extract best snippet.
 *
 * This tool is disabled (is_active=false) in the DB seed — won't run live yet.
 *
 * Boundary: no NestJS, no Discord imports.
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

const TAVILY_URL = 'https://api.tavily.com/search';
const SEARCH_TIMEOUT_MS = 15_000;
const JOKE_MAX_CHARS = 500;
const MIN_JOKE_LENGTH = 15;
const CANDIDATE_MIN_CHARS = 40;
const CANDIDATE_MAX_CHARS = 500;
const MAX_SUBJECT_LENGTH = 200;

const TRANSCRIPT_SUBJECTS = new Set(['tom segura', 'kill tony']);
const YOUTUBE_ID_REGEX = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/;

const FALLBACK_NO_TRANSCRIPT = "Couldn't pull a joke from those transcripts right now. Try again in a bit.";
const FALLBACK_NO_COMEDY = "Couldn't find a joke for that one. Try another comedian or style.";
const FALLBACK_ERROR = 'Something went wrong finding a joke. Try again in a bit.';
const FALLBACK_NO_KEY = "Web search isn't set up right now. Ask an admin to add a TAVILY_API_KEY.";
const FALLBACK_EMPTY = 'Give me a comedian or style to copy, like Tom Segura or dad jokes.';

async function tavilySearch(
  apiKey: string,
  query: string,
  maxResults: number,
  signal: AbortSignal,
): Promise<Array<Record<string, unknown>>> {
  const res = await fetch(TAVILY_URL, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ query, max_results: maxResults, search_depth: 'basic' }),
  });
  if (!res.ok) throw new Error(`Tavily ${res.status}`);
  const data = await res.json() as { results?: unknown[] };
  return (Array.isArray(data.results) ? data.results : []) as Array<Record<string, unknown>>;
}

function extractVideoIds(results: Array<Record<string, unknown>>): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const r of results) {
    const m = String(r['url'] ?? '').match(YOUTUBE_ID_REGEX);
    if (m?.[1] && !seen.has(m[1])) {
      seen.add(m[1]);
      ids.push(m[1]);
      if (ids.length >= 6) break;
    }
  }
  return ids;
}

async function fetchTranscript(videoId: string): Promise<string[]> {
  // Use the YouTube transcript API endpoint (community-maintained)
  const res = await fetch(
    `https://www.youtube.com/watch?v=${videoId}`,
    { headers: { 'Accept-Language': 'en-US,en;q=0.9' } },
  );
  const html = await res.text();
  // Extract transcript data from the page HTML (simplified approach)
  const match = html.match(/"transcriptCueGroupRenderer".*?"runs":\[(.+?)\]/);
  if (!match) return [];
  try {
    const runs = JSON.parse(`[${match[1]}]`) as Array<{ text: string }>;
    return runs.map((r) => r.text ?? '').filter(Boolean);
  } catch {
    return [];
  }
}

function buildCandidates(texts: string[]): string[] {
  const full = texts.join(' ').replace(/\s+/g, ' ').trim();
  if (full.length < CANDIDATE_MIN_CHARS) return [];
  const sentences = full.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
  const candidates: string[] = [];
  for (let i = 0; i < sentences.length; i++) {
    const seg = sentences[i]!.trim();
    if (seg.length >= CANDIDATE_MIN_CHARS && seg.length <= CANDIDATE_MAX_CHARS) {
      candidates.push(seg);
    }
  }
  return [...new Set(candidates)];
}

function extractJokeFromSnippet(content: string): string | null {
  const trimmed = content.trim();
  const dq = trimmed.match(/"([^"]+)"/);
  if (dq?.[1] && dq[1].trim().length >= MIN_JOKE_LENGTH) {
    return dq[1].trim().slice(0, JOKE_MAX_CHARS);
  }
  const cleaned = trimmed.replace(/\s+/g, ' ');
  if (cleaned.length < MIN_JOKE_LENGTH) return null;
  return cleaned.slice(0, JOKE_MAX_CHARS);
}

export function createMakeJokeLikeTool(description: string) {
  return createTool({
    id: 'make_joke_like',
    description,
    inputSchema: z.object({
      subject: z
        .string()
        .min(1)
        .describe(
          'Comedian name, style, or topic (e.g. "Tom Segura", "dad jokes", "Kill Tony").',
        ),
    }),

    execute: async (inputData) => {
      const { subject } = inputData as { subject: string };
      let query = (typeof subject === 'string' ? subject : '').trim();
      if (!query) return { success: true, joke: FALLBACK_EMPTY, isFallback: true };
      if (query.length > MAX_SUBJECT_LENGTH) query = query.slice(0, MAX_SUBJECT_LENGTH);

      const apiKey = process.env['TAVILY_API_KEY']?.trim();
      if (!apiKey) return { success: true, joke: FALLBACK_NO_KEY, isFallback: true };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);

      try {
        const normalised = query.toLowerCase();

        if (TRANSCRIPT_SUBJECTS.has(normalised)) {
          const results = await tavilySearch(apiKey, `"${query}" YouTube`, 8, controller.signal);
          clearTimeout(timeoutId);
          const videoIds = extractVideoIds(results);
          let allCandidates: string[] = [];

          if (videoIds.length > 0) {
            const settled = await Promise.allSettled(
              videoIds.map((id) =>
                Promise.race([
                  fetchTranscript(id),
                  new Promise<string[]>((_, rej) => setTimeout(() => rej(new Error('timeout')), 12_000)),
                ]),
              ),
            );
            for (const outcome of settled) {
              if (outcome.status === 'fulfilled') {
                allCandidates.push(...buildCandidates(outcome.value));
              }
            }
            const unique = [...new Set(allCandidates)];
            if (unique.length > 0) {
              const pick = unique[Math.floor(Math.random() * unique.length)]!;
              return { success: true, joke: pick.slice(0, JOKE_MAX_CHARS), isFallback: false };
            }
          }
          return { success: true, joke: FALLBACK_NO_TRANSCRIPT, isFallback: true };
        }

        // Standard Tavily comedy search
        const results = await tavilySearch(
          apiKey,
          `standup comedy jokes "${query}" famous joke`,
          8,
          controller.signal,
        );
        clearTimeout(timeoutId);

        for (const r of results) {
          const content = String(r['content'] ?? r['snippet'] ?? '');
          const joke = extractJokeFromSnippet(content);
          if (joke) return { success: true, joke, isFallback: false };
        }

        return { success: true, joke: FALLBACK_NO_COMEDY, isFallback: true };
      } catch (err) {
        clearTimeout(timeoutId);
        const isAbort = (err as { name?: string }).name === 'AbortError';
        return {
          success: true,
          joke: isAbort ? 'Took too long to find a joke. Try again.' : FALLBACK_ERROR,
          isFallback: true,
        };
      }
    },
  });
}
