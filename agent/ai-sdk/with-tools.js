/**
 * Vercel AI SDK integration with tools that can call command-like logic.
 * Use this for @mention or other flows where the model should be able to
 * trigger roasts, analysis, polls, research, etc. via tool calls.
 *
 * Requires: ai, @ai-sdk/openai, @ai-sdk/anthropic, zod
 * Env: OPENAI_API_KEY (OpenAI), ANTHROPIC_API_KEY (Claude), XAI_API_KEY (Grok). Optional: OPENAI_MODEL (overrides default). Default model: grok-4-1-fast-non-reasoning. TAVILY_API_KEY (for search_web research).
 */

const { generateText, tool } = require('ai');
const { getModel, DEFAULT_MODEL } = require('./model-provider');
const z = require('zod');

const roastConfig = require('../config/roast');
const parrotConfig = require('../config/parrot');
const { requestRoast, getOpenAIErrorMessage } = require('../commands/roast/openai');
const { formatUserDataForLLM } = require('../commands/roast/format');
const { collectUserDataForRoast } = require('../commands/roast/collect');
const { createHearingPollInChannel } = require('../commands/poll/create');
const { TIMER } = require('../config/constants');
const { scheduleTimer } = require('../abilities/timer');
const { check: checkTimerCreationLimit, record: recordTimerCreation } = require('../abilities/timer/rateLimit');
const { playInVoiceChannel } = require('../abilities/voice');
const { generateHollaResponse, FALLBACK_PHRASE } = require('../abilities/voice/holla');
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
const DEFAULT_TOOL_DESCRIPTIONS = {
    run_roast: 'Generate a short roast for a Discord user based on their recent messages. Use when the user asks to roast someone or to "roast @user", or when they confirm (e.g. "yes") after you offered to roast. When the user @mentions someone (or confirmed roasting them), the user message or a previous user message in the conversation will include a line "Mentioned users in this message: @Name (id NUMBER)"—use that NUMBER as targetUserId. Do not ask the user for the ID when it appears in that line. Uses last 7 days and server scope by default.',
    search_web: 'Search the web for current information, facts, or research. Use when the user asks to look something up, research a topic, get recent news, find facts, says "find out" (e.g. find out about X), or "search online". Also use when they ask for technical implementations, technical or performance upgrades, how to improve or beat something (e.g. "how would you beat X", "what would you add to yourself", "what technical implementations"), or comparisons to other products/people—search first, then answer from the results. Returns titles, URLs, and short snippets.',
    create_hearing_poll: 'Create a hearing poll (like /vote_hearing): anyone can add options then vote. Use when the user says: create a hearing poll, vote_hearing, vote hearing, run a hearing, do a hearing, or "poll where people can add options". Pass question (required), duration in minutes (use 0 for no limit), and anonymous (false for public votes).',
    create_timer: 'Set a timer or reminder. Use when the user says: remind me, remind me in X minutes, set a timer for X, make a timer for X, etc. Pass durationMinutes (1–1440) when the user gave a time; pass 0 when they did NOT say how long (tool will tell you to ask) or when isPopeyesTimer is true. If the user says it\'s a Popeyes timer (or says yes when you ask "This a Popeyes timer?"), pass isPopeyesTimer true and durationMinutes 0—the tool will use 10 min + random 2–15 min. Optional reminder text; replyInChannel true to post in channel when it fires, false to DM.',
    join_voice_and_squawk: 'Join the user\'s voice channel and speak via text-to-speech, then leave. Use for: (1) "holla at me" — pass empty customMessage; a short greeting (or occasionally a game-based line) is generated and spoken. (2) "say <phrase>" — pass the phrase in customMessage; that phrase is spoken. (3) When the user asks you to respond in voice chat / say it in VC / speak in voice — generate your response first, then pass it as customMessage so it is spoken. Do not reply in chat asking for clarification or a "cleaner" version; either use their wording or a funny/witty alternative you choose, then call this tool. They must be in a voice channel. If you previously offered an alternative phrase (e.g. a neutral version) and the user agrees (e.g. says "yes"), call this tool with that phrase in customMessage. Do NOT use for echo/repeat (use echo tool for that).',
    echo: 'Echo back a short message in chat only. Use ONLY when they say "echo" or "repeat" (e.g. "echo this", "repeat after me"). Do NOT use echo when they say "say"—for "say X" use join_voice_and_squawk with customMessage X so it is spoken in voice.',
    get_personality: 'Return your current personality: Role and Voice Style only. Use when the user asks what your personality is, what your role or voice style is, how you\'re supposed to act or sound, to describe yourself (as a bot), to "spit back" or "read back" your personality, or to show your role and voice / system prompt (personality parts). Call this tool to fetch the current role and voice text; then summarize or read it back in character briefly—unless they asked for the raw or exact wording.',
};

function getToolDescription(toolSlug) {
    const fromDb = parrotConfig.getToolDescriptions()[toolSlug];
    if (fromDb != null && String(fromDb).trim()) return String(fromDb).trim();
    return DEFAULT_TOOL_DESCRIPTIONS[toolSlug] || '';
}

function buildTools(context = {}) {
    const { message, client } = context;

    return {
        run_roast: tool({
            description: getToolDescription('run_roast'),
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
        }),

        create_hearing_poll: tool({
            description: getToolDescription('create_hearing_poll'),
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

        create_timer: tool({
            description: getToolDescription('create_timer'),
            parameters: z.object({
                durationMinutes: z.number().min(0).max(1440).describe('Duration in minutes (1 to 1440). Pass 0 if user did not say how long (you will ask) or if isPopeyesTimer is true.'),
                isPopeyesTimer: z.boolean().describe('True when the user says it\'s a Popeyes timer (or says yes when you ask). Uses 10m + random 2–15m.'),
                reminderMessage: z.string().describe('Optional reminder text to show when the timer fires; pass empty string if none.'),
                replyInChannel: z.boolean().describe('True to post in the same channel when timer fires; false to DM the user. Default true.'),
            }),
            execute: async ({ durationMinutes, isPopeyesTimer = false, reminderMessage, replyInChannel = true }) => {
                const channelName = message?.channel?.name ?? 'dm';
                const authorTag = message?.author?.tag ?? 'unknown';
                console.log(`${LOG_PREFIX} create_timer requested by @${authorTag} in #${channelName}: popeyes=${isPopeyesTimer} duration=${durationMinutes ?? 'none'}`);

                if (!message || !client) {
                    console.log(`${LOG_PREFIX} create_timer failed: missing Discord context`);
                    return { success: false, error: 'Missing Discord context. This must be used when someone @mentions the bot in a channel.' };
                }

                const userId = message.author?.id;
                const channelId = message.channelId;
                const guildId = message.guildId ?? null;

                if (!userId || !channelId) {
                    return { success: false, error: 'Could not determine user or channel.' };
                }

                let durationMin;
                if (isPopeyesTimer) {
                    const base = TIMER.POPEYES_BASE_MINUTES;
                    const lo = TIMER.POPEYES_RANDOM_MIN_MINUTES;
                    const hi = TIMER.POPEYES_RANDOM_MAX_MINUTES;
                    durationMin = base + lo + Math.floor(Math.random() * (hi - lo + 1));
                } else if (durationMinutes == null || durationMinutes === 0 || (typeof durationMinutes === 'number' && !Number.isFinite(durationMinutes))) {
                    return {
                        success: false,
                        error: "Need to know how long—how many minutes?",
                        hint: 'Ask the user how long they want the timer for (e.g. "How long?", "5 minutes?", "1 hour?").',
                    };
                } else {
                    durationMin = Math.max(TIMER.MIN_DURATION_MINUTES, Math.min(TIMER.MAX_DURATION_MINUTES, durationMinutes));
                }

                const rawReminder = typeof reminderMessage === 'string' ? reminderMessage.trim() : '';
                const reminderFinal = rawReminder.length > TIMER.MAX_REMINDER_LENGTH
                    ? rawReminder.slice(0, TIMER.MAX_REMINDER_LENGTH) + '…'
                    : rawReminder;

                const { allowed, retryAfterSeconds } = checkTimerCreationLimit(userId);
                if (!allowed) {
                    return {
                        success: false,
                        error: `Too many timers created lately. Try again in ${retryAfterSeconds} seconds.`,
                        hint: 'Tell the user to wait a bit before setting another timer.',
                    };
                }

                const durationMs = durationMin * 60 * 1000;
                const result = scheduleTimer(client, {
                    channelId,
                    userId,
                    guildId,
                    reminderMessage: reminderFinal,
                    replyInChannel: Boolean(replyInChannel),
                    durationMs,
                });

                if (!result.success) {
                    return { success: false, error: result.error };
                }

                recordTimerCreation(userId);

                const label = durationMin === 1 ? '1 minute' : durationMin < 60 ? `${durationMin} minutes` : durationMin === 60 ? '1 hour' : `${Math.round(durationMin / 60)} hours`;
                console.log(`${LOG_PREFIX} create_timer success for @${authorTag} in ${label}${isPopeyesTimer ? ' (Popeyes)' : ''}`);
                const prefix = isPopeyesTimer ? 'Popeyes timer set for ' : 'Timer set for ';
                return {
                    success: true,
                    durationMinutes: durationMin,
                    isPopeyesTimer,
                    message: `${prefix}${label}. I'll hit you back then.${reminderFinal ? ` Reminder: ${reminderFinal}` : ''}`,
                };
            },
        }),

        join_voice_and_squawk: tool({
            description: getToolDescription('join_voice_and_squawk'),
            parameters: z.object({
                customMessage: z.string().describe('For "say <phrase>": the phrase to speak (e.g. "say we won" → "we won"). For "holla at me": pass empty string so a greeting or game line is generated. For voice-delivery requests: the full line to speak (your composed response or a witty alternative—do not ask the user for clarification).'),
            }),
            execute: async ({ customMessage }) => {
                const channelName = message?.channel?.name ?? 'dm';
                const authorTag = message?.author?.tag ?? 'unknown';
                console.log(`${LOG_PREFIX} join_voice_and_squawk requested by @${authorTag} in #${channelName}`);

                if (!message || !client) {
                    console.log(`${LOG_PREFIX} join_voice_and_squawk failed: missing Discord context`);
                    return { success: false, error: 'Missing Discord context.' };
                }

                const guild = message.guild;
                if (!guild) {
                    return { success: false, error: 'Voice is only available in a server. Use this in a server channel.' };
                }

                const member = message.member ?? await guild.members.fetch(message.author.id).catch(() => null);
                if (!member) {
                    return { success: false, error: 'Could not find you in this server.' };
                }

                const voiceChannel = member.voice?.channel;
                if (!voiceChannel) {
                    console.log(`${LOG_PREFIX} join_voice_and_squawk skipped: @${authorTag} not in a voice channel`);
                    return {
                        success: false,
                        error: "You're not in a voice channel. Join a voice channel first, then ask again.",
                        hint: 'Tell the user to join a voice channel and say the same thing again.',
                    };
                }

                const custom = typeof customMessage === 'string' ? customMessage.trim() : '';
                let textToSpeak;
                if (custom.length > 0) {
                    textToSpeak = custom;
                    console.log(`${LOG_PREFIX} join_voice_and_squawk say: "${textToSpeak}"`);
                } else {
                    textToSpeak = await generateHollaResponse(voiceChannel, client.user?.id);
                    console.log(`${LOG_PREFIX} join_voice_and_squawk holla: "${textToSpeak.slice(0, 60)}${textToSpeak.length > 60 ? '…' : ''}"`);
                }

                if (!textToSpeak || !String(textToSpeak).trim()) {
                    textToSpeak = FALLBACK_PHRASE;
                }

                console.log(`${LOG_PREFIX} join_voice_and_squawk joining VC "${voiceChannel.name}" for @${authorTag}`);
                try {
                    const result = await playInVoiceChannel(client, voiceChannel, { type: 'tts', text: textToSpeak });
                    if (result.success) {
                        console.log(`${LOG_PREFIX} join_voice_and_squawk success for @${authorTag}`);
                        return { success: true, message: 'Joined, spoke, and left.' };
                    }
                    console.log(`${LOG_PREFIX} join_voice_and_squawk failed: ${result.error}`);
                    return { success: false, error: result.error || 'Failed to play sound.' };
                } catch (err) {
                    console.error(`${LOG_PREFIX} join_voice_and_squawk error:`, err?.message || err);
                    return { success: false, error: err?.message || 'Voice error. Try again.' };
                }
            },
        }),

        echo: tool({
            description: getToolDescription('echo'),
            parameters: z.object({
                text: z.string().describe('The short text to echo back'),
            }),
            execute: async ({ text }) => {
                return { echoed: text };
            },
        }),

        get_personality: tool({
            description: getToolDescription('get_personality'),
            parameters: z.object({}),
            execute: async () => {
                const sections = parrotConfig.getSystemPromptSections();
                const out = {
                    role: sections.role ?? '',
                    voice: sections.voice ?? '',
                };
                if (sections.voiceWeights) out.voiceWeights = sections.voiceWeights;
                if (sections.toolVoiceWeights) out.toolVoiceWeights = sections.toolVoiceWeights;
                return out;
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
    const modelId = options.model ?? DEFAULT_MODEL;
    console.log(`${LOG_PREFIX} chatWithTools using model "${modelId}"`);
    const model = getModel(modelId);
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
