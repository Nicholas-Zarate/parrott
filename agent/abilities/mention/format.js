/**
 * Format a Discord message for the parrot LLM context.
 * Produces a short, bounded string so the model knows who said what and where.
 */

const MAX_MESSAGE_CONTENT_LENGTH = 800;

/** Max messages to fetch above the current one (newest first). */
const RECENT_MESSAGES_ABOVE_LIMIT = 8;
/** Max total characters for the "recent messages above" block. */
const RECENT_MESSAGES_ABOVE_MAX_CHARS = 2000;
/** Max characters per message in that block. */
const RECENT_MESSAGE_SNIPPET_LEN = 300;

/**
 * Discord stores @mentions in message content as <@userId> or <@!userId>.
 * The gateway sometimes omits the bot from message.mentions.users when the bot is @mentioned,
 * so we use content as the source of truth for "was the bot mentioned?".
 *
 * @param {string} content - message.content
 * @param {string} [botUserId] - client.user.id
 * @returns {boolean}
 */
function isBotMentionedInContent(content, botUserId) {
    if (!content || !botUserId) return false;
    const mentionPattern = new RegExp(`<@!?${botUserId}>`);
    return mentionPattern.test(content);
}

/**
 * Strip bot mentions from content (e.g. <@123456>) so we don't send raw IDs to the model.
 * @param {string} content
 * @param {import('discord.js').User} botUser
 * @returns {string}
 */
function stripBotMention(content, botUser) {
    if (!content || !botUser) return content || '';
    const mentionPattern = new RegExp(`<@!?${botUser.id}>`, 'g');
    return content.replace(mentionPattern, '').trim();
}

/**
 * Fetch messages above the current one and format them for the parrot (e.g. "the message above me").
 * Performs I/O: message.channel.messages.fetch({ limit, before: message.id }). Newest first.
 * Caller should ensure message is not partial (e.g. event handler fetches partials before calling).
 *
 * @param {import('discord.js').Message} message - The message that triggered the mention (we fetch above this)
 * @param {import('discord.js').User} [botUser] - Bot user (to label "[Bot]" vs "[UserName]")
 * @param {{ limit?: number, maxChars?: number }} [options] - limit (default RECENT_MESSAGES_ABOVE_LIMIT), maxChars for the whole block (default RECENT_MESSAGES_ABOVE_MAX_CHARS)
 * @returns {Promise<string>} Formatted block or empty string on error/no channel
 */
async function getRecentMessagesAboveForParrot(message, botUser = null, options = {}) {
    const limit = options.limit ?? RECENT_MESSAGES_ABOVE_LIMIT;
    const maxChars = options.maxChars ?? RECENT_MESSAGES_ABOVE_MAX_CHARS;
    if (!message?.channel?.messages?.fetch) {
        return '';
    }
    try {
        const fetched = await message.channel.messages.fetch({
            limit: Math.min(limit, 10),
            before: message.id
        });
        if (!fetched || fetched.size === 0) return '';

        const lines = [];
        let total = 0;
        for (const [, m] of fetched) {
            if (total >= maxChars) break;
            const isBot = botUser && m.author?.id === botUser.id;
            const label = isBot ? 'Bot' : (m.author?.displayName ?? m.author?.username ?? m.author?.tag ?? 'Someone');
            let content = (m.content || '').trim();
            if (content.length > RECENT_MESSAGE_SNIPPET_LEN) {
                content = content.slice(0, RECENT_MESSAGE_SNIPPET_LEN) + '…';
            }
            if (!content) content = '(no text)';
            const line = `[${label}]: ${content}`;
            if (total + line.length + 1 > maxChars) {
                lines.push(line.slice(0, maxChars - total - 1));
                break;
            }
            lines.push(line);
            total += line.length + 1;
        }
        if (lines.length === 0) return '';
        return lines.join('\n');
    } catch (err) {
        console.error('[Mention] getRecentMessagesAbove error:', err?.message || err);
        return '';
    }
}

/**
 * Get the previous conversation turn (last user message + last bot reply) when the message
 * immediately above the current one is from the bot. Used to send proper user/assistant turns
 * so the model can resolve follow-ups like "yes" to the correct prior question.
 *
 * @param {import('discord.js').Message} message - The message that triggered the mention (we fetch above this)
 * @param {import('discord.js').User} [botUser] - Bot user (to identify bot message and format user message)
 * @returns {Promise<{ userContent: string, assistantContent: string } | null>}
 */
async function getPreviousTurnForParrot(message, botUser = null) {
    if (!message?.channel?.messages?.fetch || !botUser?.id) return null;
    try {
        const fetched = await message.channel.messages.fetch({ limit: 2, before: message.id });
        if (!fetched || fetched.size < 2) return null;
        const sorted = [...fetched.values()].sort((a, b) => (a.id > b.id ? -1 : a.id < b.id ? 1 : 0)); // newest first
        const first = sorted[0];  // message right above current
        const second = sorted[1]; // message before that
        const isFirstBot = first.author?.id === botUser.id;
        const isSecondUser = second.author && !second.author.bot;
        if (!isFirstBot || !isSecondUser) return null;

        const userContent = formatMessageForParrot(second, botUser);
        let assistantContent = (first.content || '').trim();
        if (assistantContent.length > MAX_MESSAGE_CONTENT_LENGTH) {
            assistantContent = assistantContent.slice(0, MAX_MESSAGE_CONTENT_LENGTH) + '…';
        }
        if (!assistantContent) assistantContent = '(no text)';
        return { userContent, assistantContent };
    } catch (err) {
        console.error('[Mention] getPreviousTurnForParrot error:', err?.message || err);
        return null;
    }
}

/**
 * Format the message for the parrot: "User X in #channel wrote: '...'" with length cap.
 * @param {import('discord.js').Message} message - The message that mentioned the bot
 * @param {import('discord.js').User} [botUser] - Bot user (used to strip its mention from content)
 * @returns {string}
 */
function formatMessageForParrot(message, botUser = null) {
    const author = message.author;
    const displayName = author.displayName ?? author.username ?? author.tag;
    const ch = message.channel;
    const channelName = (ch?.parent ? ch.parent.name : ch?.name) ?? 'unknown';
    let content = stripBotMention(message.content || '', botUser);
    if (content.length > MAX_MESSAGE_CONTENT_LENGTH) {
        content = content.slice(0, MAX_MESSAGE_CONTENT_LENGTH) + '…';
    }
    if (!content) {
        content = '(user said nothing)';
    }
    return `User @${displayName} in #${channelName} wrote: "${content}"`;
}

/** Max names in "online now" block; avoids huge context. */
const ONLINE_NOW_MAX_NAMES = 30;
/** Max chars for the online-now line. */
const ONLINE_NOW_MAX_CHARS = 600;

/**
 * Build a short "who is online now" line from the guild (requires GuildPresences + GuildMembers).
 * Status online/idle/dnd count as "online"; offline or no presence excluded. Excludes the bot.
 *
 * @param {import('discord.js').Guild} guild
 * @param {import('discord.js').User} [botUser] - Exclude this bot from the list
 * @returns {string} e.g. "Online now (this server): Alice, Bob, …" or ""
 */
function getOnlineNowForParrot(guild, botUser = null) {
    if (!guild?.members?.cache) return '';
    const names = [];
    let totalChars = 0;
    const statusOk = (s) => s === 'online' || s === 'idle' || s === 'dnd';
    for (const [, member] of guild.members.cache) {
        if (names.length >= ONLINE_NOW_MAX_NAMES || totalChars >= ONLINE_NOW_MAX_CHARS) break;
        if (botUser && member.user?.id === botUser.id) continue;
        const status = member.presence?.status;
        if (!statusOk(status)) continue;
        const name = member.displayName ?? member.user?.username ?? member.user?.tag ?? 'Someone';
        const len = name.length + (names.length ? 2 : 0);
        if (totalChars + len > ONLINE_NOW_MAX_CHARS) break;
        names.push(name);
        totalChars += len;
    }
    if (names.length === 0) return '';
    return `Online now (this server): ${names.join(', ')}`;
}

/**
 * Build the full user content sent to the parrot: optional "online now" + optional "recent messages above" + current message.
 * Single place for "what we send as the user message" so the model can refer to "the message above" or "who's online".
 *
 * @param {import('discord.js').Message} message - The message that mentioned the bot
 * @param {import('discord.js').User} [botUser] - Bot user (strip mention, label in recent block, exclude from online list)
 * @returns {Promise<string>}
 */
async function buildUserContentForParrot(message, botUser = null) {
    const userContext = formatMessageForParrot(message, botUser);
    const parts = [];
    if (message.guild) {
        const onlineLine = getOnlineNowForParrot(message.guild, botUser);
        if (onlineLine) parts.push(onlineLine);
    }
    const recentBlock = await getRecentMessagesAboveForParrot(message, botUser);
    if (recentBlock) parts.push(`Recent messages above (newest first):\n${recentBlock}`);
    parts.push(userContext);
    return parts.join('\n\n');
}

module.exports = {
    formatMessageForParrot,
    getPreviousTurnForParrot,
    getRecentMessagesAboveForParrot,
    getOnlineNowForParrot,
    buildUserContentForParrot,
    isBotMentionedInContent,
    MAX_MESSAGE_CONTENT_LENGTH,
    RECENT_MESSAGES_ABOVE_LIMIT,
    RECENT_MESSAGES_ABOVE_MAX_CHARS
};
