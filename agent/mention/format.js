/**
 * Format a Discord message for the parrot LLM context.
 * Produces a short, bounded string so the model knows who said what and where.
 */

const MAX_MESSAGE_CONTENT_LENGTH = 800;

/** Max messages to fetch above the current one (newest first). */
const RECENT_MESSAGES_ABOVE_LIMIT = 5;
/** Max total characters for the "recent messages above" block. */
const RECENT_MESSAGES_ABOVE_MAX_CHARS = 1500;
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
 * @param {{ limit?: number, maxChars?: number }} [options] - limit (default 5), maxChars for the whole block (default 1500)
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

/**
 * Build the full user content sent to the parrot: optional "recent messages above" block + current message.
 * Single place for "what we send as the user message" so the model can refer to "the message above".
 *
 * @param {import('discord.js').Message} message - The message that mentioned the bot
 * @param {import('discord.js').User} [botUser] - Bot user (strip mention, label in recent block)
 * @returns {Promise<string>}
 */
async function buildUserContentForParrot(message, botUser = null) {
    const userContext = formatMessageForParrot(message, botUser);
    const recentBlock = await getRecentMessagesAboveForParrot(message, botUser);
    return recentBlock
        ? `Recent messages above (newest first):\n${recentBlock}\n\n${userContext}`
        : userContext;
}

module.exports = {
    formatMessageForParrot,
    getRecentMessagesAboveForParrot,
    buildUserContentForParrot,
    isBotMentionedInContent,
    MAX_MESSAGE_CONTENT_LENGTH,
    RECENT_MESSAGES_ABOVE_LIMIT,
    RECENT_MESSAGES_ABOVE_MAX_CHARS
};
