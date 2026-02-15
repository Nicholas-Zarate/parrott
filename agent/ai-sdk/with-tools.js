/**
 * Vercel AI SDK integration with tools that can call command-like logic.
 * Use this for @mention or other flows where the model should be able to
 * trigger roasts, analysis, polls, research, etc. via tool calls.
 *
 * Requires: ai, @ai-sdk/openai, zod
 * Env: OPENAI_API_KEY (required). Optional: OPENAI_MODEL (default gpt-4o), TAVILY_API_KEY (for search_web research).
 */

const { generateText, tool } = require('ai');
const { openai } = require('@ai-sdk/openai');
const z = require('zod');

const roastConfig = require('../config/roast');
const { requestRoast, getOpenAIErrorMessage } = require('../commands/roast/openai');
const { formatUserDataForLLM } = require('../commands/roast/format');
const { collectUserDataForRoast } = require('../commands/roast/collect');
const { createHearingPollInChannel } = require('../commands/poll/create');
const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-4o';

const LOG_PREFIX = '[Parrott tools]';
const MAX_STEPS = 5;
const TAVILY_SEARCH_URL = 'https://api.tavily.com/search';
const SEARCH_MAX_RESULTS = 5;
const SEARCH_SNIPPET_MAX_LEN = 400;

/**
 * Build the tools object. Each tool's execute() can call existing command logic.
 * Context { message, client } is closed over so tools can access Discord channel and author.
 *
 * @param {Object} context - { message, client } (Discord context for resolving guild, replying, etc.)
 * @returns {Object} tools map for generateText
 */
function buildTools(context = {}) {
    const { message, client } = context;

    return {
        run_roast: tool({
            description: 'Generate a short roast for a Discord user based on their recent messages. Use when the user asks to roast someone or to "roast @user". Requires the target Discord user ID. Uses last 7 days and server scope by default.',
            parameters: z.object({
                targetUserId: z.string().describe('Discord user ID of the person to roast'),
            }),
            execute: async ({ targetUserId }) => {
                const days = 7;
                const scope = 'server';
                const channelName = message?.channel?.name ?? 'dm';
                console.log(`${LOG_PREFIX} run_roast requested targetUserId=${targetUserId} days=${days} scope=${scope} in #${channelName}`);
                if (!message || !client) {
                    console.log(`${LOG_PREFIX} run_roast failed: missing Discord context`);
                    return { success: false, error: 'Missing Discord context (message/client).' };
                }
                // Optional: apply rate limit here using message.author.id and checkAndRecord() from commands/roast/rateLimit.js
                const guild = message.guild;
                if (!guild) {
                    return { success: false, error: 'This command must be used in a server channel.' };
                }

                let targetUser = client.users.cache.get(targetUserId);
                if (!targetUser) {
                    try {
                        targetUser = await client.users.fetch(targetUserId);
                    } catch (_) {
                        return { success: false, error: `User ${targetUserId} not found.` };
                    }
                }

                try {
                    const channelId = scope === 'channel' ? message.channelId : undefined;
                    const { messages, activities, profile, roleNames, presence, stats } = await collectUserDataForRoast(guild, {
                        targetUserId,
                        targetUser,
                        days,
                        scope,
                        channelId,
                    });

                    if (messages.length === 0) {
                        return {
                            success: false,
                            error: `No messages found for that user in the selected scope (${scope}) and last ${days} days.`,
                        };
                    }

                    const userDataText = formatUserDataForLLM({
                        userTag: targetUser.tag,
                        userId: targetUser.id,
                        profile,
                        roleNames,
                        presence,
                        activities,
                        messages,
                        stats,
                        days,
                        scope,
                    });
                    const { content } = await requestRoast(userDataText, roastConfig);
                    console.log(`${LOG_PREFIX} run_roast success for ${targetUserId}`);
                    return { success: true, roast: content };
                } catch (err) {
                    console.error(`${LOG_PREFIX} run_roast error:`, err.message || err, err.detail || '');
                    const userMsg = getOpenAIErrorMessage(err);
                    return { success: false, error: userMsg };
                }
            },
        }),

        search_web: tool({
            description: 'Search the web for current information, facts, or research. Use when the user asks to look something up, research a topic, get recent news, find facts, says "find out" (e.g. find out about X), or "search online". Returns titles, URLs, and short snippets.',
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
        }),

        create_hearing_poll: tool({
            description: 'Create a hearing poll (like /vote_hearing): anyone can add options then vote. Use when the user says: create a hearing poll, vote_hearing, vote hearing, run a hearing, do a hearing, or "poll where people can add options". Pass question (required), duration in minutes (use 0 for no limit), and anonymous (false for public votes).',
            parameters: z.object({
                question: z.string().min(1).describe('The poll question or topic'),
                duration: z.number().min(0).describe('Duration in minutes; use 0 for no time limit'),
                anonymous: z.boolean().describe('Whether to hide voter names; use false for public votes'),
            }),
            execute: async ({ question, duration, anonymous }) => {
                const channelName = message?.channel?.name ?? 'dm';
                const authorTag = message?.author?.tag ?? 'unknown';
                console.log(`${LOG_PREFIX} create_hearing_poll requested by @${authorTag} in #${channelName}: question="${question?.slice(0, 60)}${question?.length > 60 ? '…' : ''}" duration=${duration} anonymous=${anonymous}`);

                if (!message || !client) {
                    console.log(`${LOG_PREFIX} create_hearing_poll failed: missing Discord context`);
                    return { success: false, error: 'Missing Discord context. This must be used when someone @mentions the bot in a channel.' };
                }

                const channel = message.channel;
                if (!channel?.send) {
                    console.log(`${LOG_PREFIX} create_hearing_poll failed: channel does not support sending messages`);
                    return { success: false, error: 'Cannot send messages in this channel.' };
                }

                const q = typeof question === 'string' ? question.trim() : '';
                if (!q) {
                    console.log(`${LOG_PREFIX} create_hearing_poll failed: question is missing or empty — tell user to provide a question`);
                    return {
                        success: false,
                        error: 'The poll question is required and cannot be empty.',
                        hint: 'Ask the user: "What question or topic do you want for the hearing poll?" Example: "Should we meet on Tuesday or Wednesday?"',
                    };
                }

                const dur = typeof duration === 'number' && duration >= 0 ? Math.min(duration, 10080) : 0; // cap 7 days
                const anon = Boolean(anonymous);

                try {
                    const result = await createHearingPollInChannel(channel, message.author, { question: q, duration: dur, anonymous: anon }, client);
                    console.log(`${LOG_PREFIX} create_hearing_poll success messageId=${result.messageId} in #${channelName}`);
                    return {
                        success: true,
                        messageId: result.messageId,
                        message: `Hearing poll created in #${channel.name}. People can add options with "Add option" and then vote.${dur > 0 ? ` It will end in ${dur} minutes.` : ''}`,
                    };
                } catch (err) {
                    console.error(`${LOG_PREFIX} create_hearing_poll error:`, err.message || err);
                    return {
                        success: false,
                        error: err.message || 'Failed to create the poll.',
                        hint: 'Suggest the user try again or use the slash command /vote_hearing with a question.',
                    };
                }
            },
        }),

        echo: tool({
            description: 'Echo back a short message. Use only when the user explicitly asks to echo or repeat something.',
            parameters: z.object({
                text: z.string().describe('The short text to echo back'),
            }),
            execute: async ({ text }) => {
                return { echoed: text };
            },
        }),
    };
}

/**
 * Run chat with tools. Tools can call roast/analysis/poll logic; context provides Discord access.
 *
 * @param {Array<{ role: string, content: string }>} messages - Chat messages (e.g. system + user)
 * @param {Object} context - { message, client } for tool execution
 * @param {{ model?: string, maxTokens?: number }} [options] - Optional model ID and max tokens (default from env / roastConfig)
 * @returns {Promise<{ text: string, steps?: Array }>}
 */
async function chatWithTools(messages, context = {}, options = {}) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || !apiKey.trim()) {
        const err = new Error('OpenAI API key not configured');
        err.code = 'NO_API_KEY';
        throw err;
    }

    const modelId = options.model ?? DEFAULT_MODEL;
    const model = openai(modelId);
    const tools = buildTools(context);
    const maxTokens = options.maxTokens ?? roastConfig.max_completion_tokens ?? 256;

    const result = await generateText({
        model,
        messages,
        tools,
        maxSteps: MAX_STEPS,
        maxTokens,
    });

    return {
        text: result.text,
        steps: result.steps,
        response: result.response,
    };
}

module.exports = {
    chatWithTools,
    buildTools,
};
