/**
 * Look up a joke for the make_joke_like tool. For transcript-friendly subjects (Tom Segura,
 * Kill Tony), fetches two YouTube transcripts and uses an LLM to pick the funniest excerpt.
 * Otherwise uses Tavily comedy search. On any failure we return a speakable fallback message
 * (no Tavily fallback from transcript path). Logs fallbacks/errors via getLogger.
 *
 * Env: TAVILY_API_KEY (required for search). For transcript path: OPENAI_API_KEY or same as parrot model.
 */

const { YoutubeTranscript } = require('youtube-transcript');
const { generateText } = require('ai');
const { getModel } = require('../../ai-sdk/model-provider');
const { getLogger } = require('../../supabase/logs');

const logger = getLogger('make-joke-like');

// #region agent log
function debugLog(message, data, hypothesisId) {
    const payload = { location: 'get-joke.js', message, data: data || {}, timestamp: Date.now() };
    if (hypothesisId) payload.hypothesisId = hypothesisId;
    fetch('http://127.0.0.1:7242/ingest/4b364862-5458-4ab4-a978-df8176059b80', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => {});
}
// #endregion

const TAVILY_SEARCH_URL = 'https://api.tavily.com/search';
const SEARCH_MAX_RESULTS = 8;
const JOKE_MAX_CHARS = 500;
const SEARCH_TIMEOUT_MS = 15000;
const TRANSCRIPT_TIMEOUT_MS = 12000;
const MIN_JOKE_LENGTH = 15;
/** Try more videos so we still get a joke when some have transcripts disabled. */
const NUM_VIDEOS_TO_FETCH = 6;
const CANDIDATE_MIN_CHARS = 40;
const CANDIDATE_MAX_CHARS = 500;
const MAX_CANDIDATES_FOR_LLM = 35;

/** Subjects that get the two-video YouTube transcript path. */
const TRANSCRIPT_SUBJECTS = new Set(['tom segura', 'kill tony']);

/** Max subject length to avoid oversized search requests. */
const MAX_SUBJECT_LENGTH = 200;

/** Speakable fallback messages when no joke is found (returned as joke so parrot says them in voice). */
const FALLBACK_NO_TRANSCRIPT = "Couldn't pull a joke from those transcripts right now. Try again in a bit.";
const FALLBACK_NO_COMEDY = "Couldn't find a joke for that one. Try another comedian or style.";
const FALLBACK_ERROR = "Something went wrong finding a joke. Try again in a bit.";
const FALLBACK_NO_SEARCH_KEY = "Web search isn't set up right now. Ask an admin to add a search key.";
const FALLBACK_EMPTY_SUBJECT = "Give me a comedian or style to copy, like Tom Segura or dad jokes.";

const YOUTUBE_ID_REGEX = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/;

/**
 * Call Tavily search. Returns { results } or throws.
 * @param {string} apiKey
 * @param {string} searchQuery
 * @param {AbortSignal} [signal]
 * @returns {Promise<{ results: Array<{ url?: string, content?: string, snippet?: string }> }>}
 */
async function tavilySearch(apiKey, searchQuery, signal) {
    const res = await fetch(TAVILY_SEARCH_URL, {
        method: 'POST',
        signal,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            query: searchQuery,
            max_results: SEARCH_MAX_RESULTS,
            search_depth: 'basic',
        }),
    });
    if (!res.ok) {
        const errBody = await res.text();
        let errMsg = `Tavily API error: ${res.status}`;
        try {
            const data = JSON.parse(errBody);
            errMsg = data.detail?.error || data.error || errMsg;
        } catch (_) { /* ignore */ }
        if (res.status === 401) throw new Error('Invalid or missing Tavily API key.');
        if (res.status === 429) throw new Error('Search rate limit reached. Try again in a moment.');
        throw new Error(errMsg);
    }
    const data = await res.json();
    const results = Array.isArray(data.results) ? data.results : [];
    return { results };
}

/**
 * Extract up to NUM_VIDEOS_TO_FETCH YouTube video IDs from Tavily result URLs.
 * @param {Array<{ url?: string }>} results
 * @returns {string[]}
 */
function getTwoVideoIdsFromTavilyResults(results) {
    const ids = [];
    const seen = new Set();
    for (const r of results) {
        const url = r.url || '';
        const m = url.match(YOUTUBE_ID_REGEX);
        if (m && m[1] && !seen.has(m[1])) {
            seen.add(m[1]);
            ids.push(m[1]);
            if (ids.length >= NUM_VIDEOS_TO_FETCH) break;
        }
    }
    return ids;
}

/**
 * Build candidate joke strings from transcript chunks (1–3 sentences, length-filtered).
 * @param {Array<{ text: string }>} chunks
 * @returns {string[]}
 */
function buildCandidatesFromTranscript(chunks) {
    if (!Array.isArray(chunks) || chunks.length === 0) return [];
    const fullText = chunks.map((c) => (c && c.text) || '').filter(Boolean).join(' ').trim();
    if (fullText.length < CANDIDATE_MIN_CHARS) return [];

    const normalized = fullText.replace(/\s+/g, ' ');
    const sentences = normalized.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
    const candidates = [];

    if (sentences.length === 0) {
        return [];
    }
    if (sentences.length === 1 && normalized === sentences[0]) {
        /* No sentence boundaries: use sliding chunks so we still get candidates */
        for (let start = 0; start < normalized.length - CANDIDATE_MIN_CHARS; start += 180) {
            const chunk = normalized.slice(start, start + CANDIDATE_MAX_CHARS).trim();
            if (chunk.length >= CANDIDATE_MIN_CHARS) candidates.push(chunk);
        }
        return [...new Set(candidates)];
    }

    for (let i = 0; i < sentences.length; i++) {
        let segment = sentences[i].trim();
        if (segment.length >= CANDIDATE_MIN_CHARS && segment.length <= CANDIDATE_MAX_CHARS) {
            candidates.push(segment);
        }
        for (let j = i + 1; j < Math.min(i + 3, sentences.length); j++) {
            segment = sentences.slice(i, j + 1).join(' ').trim();
            if (segment.length >= CANDIDATE_MIN_CHARS && segment.length <= CANDIDATE_MAX_CHARS) {
                candidates.push(segment);
            }
        }
    }

    return [...new Set(candidates)];
}

const PICK_JOKE_SYSTEM = `You are choosing one joke to tell aloud from excerpts of comedy transcripts (e.g. Tom Segura, Kill Tony style). Pick the single funniest excerpt. Crass or edgy is fine. Reply with only the chosen joke text—no numbering, no quotes, no explanation.`;

/**
 * Use the LLM to pick the funniest joke from candidates. Falls back to random if LLM fails.
 * @param {string[]} candidates
 * @returns {Promise<string|null>}
 */
async function selectFunniestJokeWithLLM(candidates) {
    if (!candidates || candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0].trim().slice(0, JOKE_MAX_CHARS);

    const capped =
        candidates.length <= MAX_CANDIDATES_FOR_LLM
            ? candidates
            : candidates
                  .slice()
                  .sort(() => Math.random() - 0.5)
                  .slice(0, MAX_CANDIDATES_FOR_LLM);
    const numbered = capped.map((c, i) => `${i + 1}. ${c}`).join('\n\n');
    const userContent = `Here are excerpts from two comedy transcripts. Pick the single funniest one to tell aloud. Reply with only that joke text.\n\n${numbered}`;

    try {
        const model = getModel(process.env.OPENAI_MODEL || 'gpt-4o-mini');
        const result = await generateText({
            model,
            messages: [
                { role: 'system', content: PICK_JOKE_SYSTEM },
                { role: 'user', content: userContent },
            ],
            maxTokens: 120,
        });
        let joke = (result.text && typeof result.text === 'string') ? result.text.trim() : '';
        joke = joke.replace(/^\d+\.\s*/, '').trim();
        if (joke.length >= MIN_JOKE_LENGTH) return joke.slice(0, JOKE_MAX_CHARS);
    } catch (_) {
        /* fall through to random pick */
    }

    const randomIndex = Math.floor(Math.random() * candidates.length);
    return candidates[randomIndex].trim().slice(0, JOKE_MAX_CHARS);
}

/**
 * Extract a joke-like string from search snippet. Prefers quoted text (punchlines);
 * otherwise takes the start of the snippet up to JOKE_MAX_CHARS.
 * @param {string} content - Raw snippet from Tavily
 * @returns {string|null} - Extracted joke or null if nothing usable
 */
function extractJokeFromSnippet(content) {
    if (typeof content !== 'string' || !content.trim()) return null;
    const trimmed = content.trim();

    const doubleQuoted = trimmed.match(/"([^"]+)"/);
    if (doubleQuoted && doubleQuoted[1].trim().length >= MIN_JOKE_LENGTH) {
        return doubleQuoted[1].trim().slice(0, JOKE_MAX_CHARS);
    }
    const singleQuoted = trimmed.match(/'([^']+)'/);
    if (singleQuoted && singleQuoted[1].trim().length >= MIN_JOKE_LENGTH) {
        return singleQuoted[1].trim().slice(0, JOKE_MAX_CHARS);
    }

    const cleaned = trimmed.replace(/\s+/g, ' ').trim();
    if (cleaned.length < MIN_JOKE_LENGTH) return null;
    return cleaned.slice(0, JOKE_MAX_CHARS);
}

/**
 * Fetch a joke for a subject. On failure returns a speakable fallback message (parrot says it in voice).
 * Logs fallbacks and errors to terminal and Supabase via getLogger.
 *
 * @param {string} subject - Comedian name, style, or topic (e.g. "Dave Chappelle", "dad jokes", "Tom Segura")
 * @returns {Promise<{ success: true, joke: string }>}
 */
async function getJokeForSubject(subject) {
    let query = typeof subject === 'string' ? subject.trim() : '';
    if (!query) {
        logger.error('make_joke_like fallback: empty subject', { subject: String(subject) });
        return { success: true, joke: FALLBACK_EMPTY_SUBJECT, isFallback: true };
    }
    if (query.length > MAX_SUBJECT_LENGTH) {
        query = query.slice(0, MAX_SUBJECT_LENGTH);
    }

    const apiKey = process.env.TAVILY_API_KEY?.trim();
    if (!apiKey) {
        logger.error('make_joke_like fallback: TAVILY_API_KEY not set', { subject: query });
        return { success: true, joke: FALLBACK_NO_SEARCH_KEY, isFallback: true };
    }

    const controller = new AbortController();
    let timeoutId = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
    const signal = controller.signal;

    try {
        const normalizedSubject = query.toLowerCase();
        const useTranscriptPath = TRANSCRIPT_SUBJECTS.has(normalizedSubject);
        // #region agent log
        debugLog('getJokeForSubject path', { subject: query, normalizedSubject, useTranscriptPath }, 'entry');
        // #endregion

        if (TRANSCRIPT_SUBJECTS.has(normalizedSubject)) {
            const { results } = await tavilySearch(apiKey, `"${query}" YouTube`, signal);
            clearTimeout(timeoutId);
            const videoIds = getTwoVideoIdsFromTavilyResults(results);
            // #region agent log
            debugLog('Tavily transcript search', { resultsCount: results.length, videoIdsCount: videoIds.length, videoIds }, 'A');
            // #endregion
            let allCandidates = [];

            if (videoIds.length > 0) {
                const transcriptPromises = videoIds.map((videoId) => {
                    return Promise.race([
                        YoutubeTranscript.fetchTranscript(videoId),
                        new Promise((_, rej) =>
                            setTimeout(() => rej(new Error('Transcript timeout')), TRANSCRIPT_TIMEOUT_MS)
                        ),
                    ]);
                });

                const settled = await Promise.allSettled(transcriptPromises);
                // #region agent log
                const transcriptStatuses = settled.map((s, i) => ({ i, status: s.status, chunkCount: s.status === 'fulfilled' && Array.isArray(s.value) ? s.value.length : 0, reason: s.status === 'rejected' ? (s.reason?.message || String(s.reason)) : null }));
                debugLog('Transcript fetch outcomes', { transcriptStatuses }, 'B');
                // #endregion

                for (const outcome of settled) {
                    if (outcome.status === 'fulfilled' && Array.isArray(outcome.value)) {
                        const candidates = buildCandidatesFromTranscript(outcome.value);
                        allCandidates.push(...candidates);
                    }
                }

                const uniqueCandidates = [...new Set(allCandidates)];
                // #region agent log
                debugLog('Candidates after build', { allCandidatesLength: allCandidates.length, uniqueCandidatesLength: uniqueCandidates.length }, 'C');
                // #endregion
                if (uniqueCandidates.length > 0) {
                    const joke = await selectFunniestJokeWithLLM(uniqueCandidates);
                    // #region agent log
                    debugLog('LLM joke pick', { candidatesCount: uniqueCandidates.length, jokeLength: joke ? joke.length : 0, jokeNull: joke == null }, 'D');
                    // #endregion
                    if (joke) return { success: true, joke, isFallback: false };
                }
            }

            // #region agent log
            debugLog('FALLBACK_NO_TRANSCRIPT reason', { reason: videoIds.length === 0 ? 'no_video_ids' : 'no_candidates_or_llm', videoIdsCount: videoIds.length, candidatesCount: allCandidates.length }, 'summary');
            // #endregion
            logger.error('make_joke_like fallback: no joke from transcript path', {
                subject: query,
                reason: videoIds.length === 0 ? 'no_video_ids' : 'no_candidates_or_llm',
                videoIdsCount: videoIds.length,
                candidatesCount: allCandidates.length,
            });
            return { success: true, joke: FALLBACK_NO_TRANSCRIPT, isFallback: true };
        }

        const { results } = await tavilySearch(
            apiKey,
            `standup comedy skits jokes "${query}" famous joke`,
            signal
        );
        clearTimeout(timeoutId);

        if (results.length === 0) {
            logger.error('make_joke_like fallback: Tavily returned no results', { subject: query });
            return { success: true, joke: FALLBACK_NO_COMEDY, isFallback: true };
        }

        for (const r of results) {
            const content = r.content || r.snippet || '';
            const joke = extractJokeFromSnippet(content);
            if (joke) return { success: true, joke, isFallback: false };
        }

        const firstContent = (results[0].content || results[0].snippet || '').trim();
        if (firstContent.length >= MIN_JOKE_LENGTH) {
            const fallback = firstContent.replace(/\s+/g, ' ').trim().slice(0, JOKE_MAX_CHARS);
            return { success: true, joke: fallback, isFallback: false };
        }

        logger.error('make_joke_like fallback: no extractable joke from Tavily snippets', { subject: query });
        return { success: true, joke: FALLBACK_NO_COMEDY, isFallback: true };
    } catch (err) {
        clearTimeout(timeoutId);
        const isAbort = err.name === 'AbortError';
        logger.error('make_joke_like error', {
            subject: query,
            error: err?.message || String(err),
            isAbort,
        });
        return { success: true, joke: FALLBACK_ERROR, isFallback: true };
    }
}

module.exports = {
    getJokeForSubject,
    JOKE_MAX_CHARS,
};
