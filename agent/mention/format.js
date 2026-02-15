/**
 * Format a Discord message for the parrot LLM context.
 * Produces a short, bounded string so the model knows who said what and where.
 */

const MAX_MESSAGE_CONTENT_LENGTH = 800;

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

module.exports = {
    formatMessageForParrot,
    MAX_MESSAGE_CONTENT_LENGTH
};
