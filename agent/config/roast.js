/**
 * Roast command: OpenAI model and prompt configuration.
 * Edit systemPromptSections (object) and systemPromptOrder (array) to change tone or add context.
 * systemPrompt is built by concatenating sections in order; consumers use the final string.
 * Placeholders: {{USER_DATA}} (required), optional later: {{GUILD_NAME}}, {{DAYS}}, {{SCOPE}}
 */
const { ANALYSIS } = require('./constants');

/** Named sections of the system prompt; order is defined by systemPromptOrder. */
const systemPromptSections = {
    role: 'You are a friendly parrot giving a light, playful roast.',
    task: 'Write a short response under 5 words—a gentle, funny tease a parrot would say. Base it on the user\'s messages and activity. Keep it light and good-natured; no harsh or snarky put-downs.',
    constraints: 'Keep it light and avoid real harassment. Don\'t use the keyword "attachments".'
};

/** Order of section keys when building the final system prompt. */
const systemPromptOrder = ['role', 'task', 'constraints'];

function buildSystemPrompt(sections, order) {
    return order.map((key) => sections[key]).filter(Boolean).join(' ');
}

module.exports = {
    model: 'gpt-4o-mini',
    max_tokens: 100,

    /** Cap total characters sent to the LLM for user data (keeps context window and cost bounded). */
    MAX_USER_DATA_CHARS: 7000,
    /** Truncate each message to this length. */
    MAX_MESSAGE_LENGTH: 200,
    /** Max role names to include in context. */
    MAX_ROLE_NAMES: 10,
    /** Max top emojis in behavior stats. */
    MAX_EMOJI_TOP: 5,
    /** Max length of per-message context suffix (e.g. "(reply, 2 attachments)"). */
    MAX_MESSAGE_CONTEXT_LENGTH: 60,

    /** Default days of history for /roast (max is ANALYSIS.MAX_DAYS, e.g. 90). */
    defaultDays: 90,
    minDays: ANALYSIS.MIN_DAYS,
    maxDays: ANALYSIS.MAX_DAYS,

    /** Rate limit: max uses per user per window. */
    rateLimit: {
        maxUses: 3,
        windowMinutes: 5
    },

    systemPromptSections,
    systemPromptOrder,
    systemPrompt: buildSystemPrompt(systemPromptSections, systemPromptOrder),

    userPromptTemplate: 'Based on the following Discord user and their recent messages and activity, write a short, light tease (1 or 2 phrases). Keep it friendly and good-natured. Be specific to their messages or activity when possible. Do not focus on attachments. Keep it short.\n\n{{USER_DATA}}',
};
