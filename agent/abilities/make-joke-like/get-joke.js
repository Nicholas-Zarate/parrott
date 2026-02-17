/**
 * Look up a joke from comedy skits via Tavily search for the make_joke_like tool.
 * Returns a single joke (one-liner or short setup+punchline), length-capped for TTS.
 *
 * Env: TAVILY_API_KEY (required for search).
 */

const TAVILY_SEARCH_URL = 'https://api.tavily.com/search';
const SEARCH_MAX_RESULTS = 5;
const JOKE_MAX_CHARS = 500;
const SEARCH_TIMEOUT_MS = 15000;
const MIN_JOKE_LENGTH = 15;

/**
 * Extract a joke-like string from search snippet. Prefers quoted text (punchlines);
 * otherwise takes the start of the snippet up to JOKE_MAX_CHARS.
 * @param {string} content - Raw snippet from Tavily
 * @returns {string|null} - Extracted joke or null if nothing usable
 */
function extractJokeFromSnippet(content) {
    if (typeof content !== 'string' || !content.trim()) return null;
    const trimmed = content.trim();

    // Prefer content inside double or single quotes (often the actual punchline)
    const doubleQuoted = trimmed.match(/"([^"]+)"/);
    if (doubleQuoted && doubleQuoted[1].trim().length >= MIN_JOKE_LENGTH) {
        return doubleQuoted[1].trim().slice(0, JOKE_MAX_CHARS);
    }
    const singleQuoted = trimmed.match(/'([^']+)'/);
    if (singleQuoted && singleQuoted[1].trim().length >= MIN_JOKE_LENGTH) {
        return singleQuoted[1].trim().slice(0, JOKE_MAX_CHARS);
    }

    // Otherwise use the start of the snippet (may be a joke or transcript line)
    const cleaned = trimmed.replace(/\s+/g, ' ').trim();
    if (cleaned.length < MIN_JOKE_LENGTH) return null;
    return cleaned.slice(0, JOKE_MAX_CHARS);
}

/**
 * Fetch a joke for a subject (comedian, style, or topic) via Tavily and return one for TTS.
 *
 * @param {string} subject - Comedian name, style, or topic (e.g. "Dave Chappelle", "dad jokes")
 * @returns {Promise<{ success: true, joke: string } | { success: false, error: string }>}
 */
async function getJokeForSubject(subject) {
    const query = typeof subject === 'string' ? subject.trim() : '';
    if (!query) {
        return { success: false, error: 'Subject cannot be empty.' };
    }

    const apiKey = process.env.TAVILY_API_KEY?.trim();
    if (!apiKey) {
        return {
            success: false,
            error: 'Web search is not configured. Set TAVILY_API_KEY to enable make a joke like.',
        };
    }

    const searchQuery = `standup comedy skits jokes "${query}" famous joke`;
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
            return { success: false, error: "Couldn't find a joke for that subject." };
        }

        for (const r of results) {
            const content = r.content || r.snippet || '';
            const joke = extractJokeFromSnippet(content);
            if (joke) {
                return { success: true, joke };
            }
        }

        // No snippet looked like a joke; use first result content truncated
        const firstContent = (results[0].content || results[0].snippet || '').trim();
        if (firstContent.length >= MIN_JOKE_LENGTH) {
            const fallback = firstContent.replace(/\s+/g, ' ').trim().slice(0, JOKE_MAX_CHARS);
            return { success: true, joke: fallback };
        }

        return { success: false, error: "Couldn't find a joke for that subject." };
    } catch (err) {
        const isAbort = err.name === 'AbortError';
        return {
            success: false,
            error: isAbort ? 'Search timed out.' : (err.message || 'Joke search failed.'),
        };
    } finally {
        clearTimeout(timeoutId);
    }
}

module.exports = {
    getJokeForSubject,
    JOKE_MAX_CHARS,
};
