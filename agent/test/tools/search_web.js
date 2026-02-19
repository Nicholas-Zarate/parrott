/**
 * search_web tool: Tavily API web search for research.
 */

const { tool } = require('ai');
const z = require('zod');
const { getToolDescription, LOG_PREFIX } = require('./helpers/helpers');

const TAVILY_SEARCH_URL = 'https://api.tavily.com/search';
const SEARCH_MAX_RESULTS = 5;
const SEARCH_SNIPPET_MAX_LEN = 400;

function buildSearchWebTool(context) {
    const { message } = context;
    return tool({
        description: getToolDescription('search_web'),
        parameters: z.object({
            query: z.string().min(1).describe('The search query (e.g. "current weather NYC", "who won the 2024 election")'),
        }),
        execute: async ({ query }) => {
            const apiKey = process.env.TAVILY_API_KEY?.trim();
            if (!apiKey) {
                console.log(`${LOG_PREFIX} search_web skipped: TAVILY_API_KEY not set`);
                return {
                    success: false,
                    error: 'Web search is not configured. Set TAVILY_API_KEY in the environment to enable research.',
                    hint: 'Tell the user research is not available right now, or they can ask an admin to add a Tavily API key.',
                };
            }
            const q = typeof query === 'string' ? query.trim() : '';
            if (!q) {
                return { success: false, error: 'Search query cannot be empty.', hint: 'Ask the user what they want to look up.' };
            }
            console.log(`${LOG_PREFIX} search_web query="${q.slice(0, 60)}${q.length > 60 ? '…' : ''}"`);
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);
            try {
                const res = await fetch(TAVILY_SEARCH_URL, {
                    method: 'POST',
                    signal: controller.signal,
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify({
                        query: q,
                        max_results: SEARCH_MAX_RESULTS,
                        search_depth: 'basic',
                    }),
                });
                clearTimeout(timeoutId);
                if (!res.ok) {
                    const errBody = await res.text();
                    let errMsg = `Tavily API error: ${res.status}`;
                    try {
                        const data = JSON.parse(errBody);
                        errMsg = data.detail?.error || data.error || errMsg;
                    } catch (_) { /* ignore */ }
                    if (res.status === 401) {
                        return { success: false, error: 'Invalid or missing Tavily API key.', hint: 'Check TAVILY_API_KEY.' };
                    }
                    if (res.status === 429) {
                        return { success: false, error: 'Search rate limit reached. Try again in a moment.' };
                    }
                    console.error(`${LOG_PREFIX} search_web error:`, errMsg);
                    return { success: false, error: errMsg };
                }
                const data = await res.json();
                const results = Array.isArray(data.results) ? data.results : [];
                const items = results.slice(0, SEARCH_MAX_RESULTS).map((r) => {
                    const content = (r.content || r.snippet || '').slice(0, SEARCH_SNIPPET_MAX_LEN);
                    return { title: r.title || '(no title)', url: r.url || '', content: content + (content.length >= SEARCH_SNIPPET_MAX_LEN ? '…' : '') };
                });
                console.log(`${LOG_PREFIX} search_web success results=${items.length}`);
                return { success: true, query: q, results: items };
            } catch (err) {
                clearTimeout(timeoutId);
                const isAbort = err.name === 'AbortError';
                console.error(`${LOG_PREFIX} search_web error:`, isAbort ? 'timeout' : (err.message || err));
                return {
                    success: false,
                    error: isAbort ? 'Search timed out.' : (err.message || 'Search failed.'),
                    hint: 'Suggest the user try again or rephrase the question.',
                };
            }
        },
    });
}

module.exports = { buildSearchWebTool };
