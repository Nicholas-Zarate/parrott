/**
 * Look up a song's famous lyrics via Tavily search for the sing_song tool.
 * Returns a single lyric phrase, length-capped for TTS (a configurable response ending may be appended via runtime config).
 *
 * Env: TAVILY_API_KEY (required for search).
 */

const TAVILY_SEARCH_URL = 'https://api.tavily.com/search';
const SEARCH_MAX_RESULTS = 5;
const LYRIC_MAX_CHARS = 1000;
const SEARCH_TIMEOUT_MS = 15000;

/** Phrases that indicate a snippet is article/description prose, not actual lyrics. */
const DESCRIPTION_STARTS = [
    /^listeners\s+revisit/i,
    /^the\s+song\s+/i,
    /^from\s+the\s+(album|unforgettable|hit)/i,
    /^this\s+track\s+/i,
    /^iconic\s+lyrics[,.]/i,
    /^young\s+dro'?s\s+iconic/i,
    /^the\s+track\s+/i,
    /^the\s+lyrics\s+/i,
    /^in\s+this\s+(song|track)/i,
    /^the\s+artist\s+/i,
];

/**
 * True if the text looks like article/description prose rather than actual song lyrics.
 * @param {string} text - Trimmed snippet or extracted string
 * @returns {boolean}
 */
function looksLikeDescription(text) {
    if (typeof text !== 'string' || text.length < 20) return false;
    const start = text.replace(/\s+/g, ' ').trim().slice(0, 120);
    return DESCRIPTION_STARTS.some((re) => re.test(start));
}

/**
 * Extract a lyric-like string from search snippet. Prefers quoted text; otherwise takes
 * the start of the snippet up to LYRIC_MAX_CHARS. Skips snippets that look like descriptions.
 * @param {string} content - Raw snippet from Tavily
 * @returns {string|null} - Extracted lyric or null if nothing usable
 */
function extractLyricFromSnippet(content) {
    if (typeof content !== 'string' || !content.trim()) return null;
    const trimmed = content.trim();

    // Prefer content inside double or single quotes (often the actual lyric)
    const doubleQuoted = trimmed.match(/"([^"]+)"/);
    if (doubleQuoted && doubleQuoted[1].trim().length >= 10) {
        const lyric = doubleQuoted[1].trim().slice(0, LYRIC_MAX_CHARS);
        if (!looksLikeDescription(lyric)) return lyric;
    }
    const singleQuoted = trimmed.match(/'([^']+)'/);
    if (singleQuoted && singleQuoted[1].trim().length >= 10) {
        const lyric = singleQuoted[1].trim().slice(0, LYRIC_MAX_CHARS);
        if (!looksLikeDescription(lyric)) return lyric;
    }

    // Otherwise use the start of the snippet only if it doesn't look like description prose
    const cleaned = trimmed.replace(/\s+/g, ' ').trim();
    if (cleaned.length < 15 || looksLikeDescription(cleaned)) return null;
    return cleaned.slice(0, LYRIC_MAX_CHARS);
}

/**
 * Fetch famous lyrics for a song via Tavily and return one phrase for TTS.
 *
 * @param {string} songQuery - Song name or "artist - song" (e.g. "Never Gonna Give You Up")
 * @returns {Promise<{ success: true, lyric: string } | { success: false, error: string }>}
 */
async function getLyricsForSong(songQuery) {
    const query = typeof songQuery === 'string' ? songQuery.trim() : '';
    if (!query) {
        return { success: false, error: 'Song query cannot be empty.' };
    }

    const apiKey = process.env.TAVILY_API_KEY?.trim();
    if (!apiKey) {
        return {
            success: false,
            error: 'Web search is not configured. Set TAVILY_API_KEY to enable sing.',
        };
    }

    const searchQuery = `famous lyrics from "${query}" song iconic line`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);

    try {
        const res = await fetch(TAVILY_SEARCH_URL, {
            method: 'POST',
            signal: controller.signal,
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
            if (res.status === 401) {
                return { success: false, error: 'Invalid or missing Tavily API key.' };
            }
            if (res.status === 429) {
                return { success: false, error: 'Search rate limit reached. Try again in a moment.' };
            }
            return { success: false, error: errMsg };
        }

        const data = await res.json();
        const results = Array.isArray(data.results) ? data.results : [];
        if (results.length === 0) {
            return { success: false, error: "Couldn't find lyrics for that song." };
        }

        // Collect all extractable lyrics, then prefer the longest (so we don't return a short quoted one-liner when a longer verse exists)
        const candidates = [];
        for (const r of results) {
            const content = r.content || r.snippet || '';
            const lyric = extractLyricFromSnippet(content);
            if (lyric && lyric.length >= 15) {
                candidates.push(lyric);
            }
        }
        if (candidates.length > 0) {
            const best = candidates.reduce((a, b) => (a.length >= b.length ? a : b));
            return { success: true, lyric: best.slice(0, LYRIC_MAX_CHARS) };
        }

        // No snippet looked like lyrics; use first result content truncated only if not description prose
        for (const r of results) {
            const firstContent = (r.content || r.snippet || '').trim().replace(/\s+/g, ' ').trim();
            if (firstContent.length >= 15 && !looksLikeDescription(firstContent)) {
                return { success: true, lyric: firstContent.slice(0, LYRIC_MAX_CHARS) };
            }
        }

        return { success: false, error: "Couldn't find lyrics for that song." };
    } catch (err) {
        const isAbort = err.name === 'AbortError';
        return {
            success: false,
            error: isAbort ? 'Search timed out.' : (err.message || 'Lyric search failed.'),
        };
    } finally {
        clearTimeout(timeoutId);
    }
}

module.exports = {
    getLyricsForSong,
    LYRIC_MAX_CHARS,
};
