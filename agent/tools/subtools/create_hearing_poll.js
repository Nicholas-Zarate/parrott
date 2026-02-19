/**
 * Discord-commands subtool: create a hearing poll in the channel.
 * Shared handler used by both the standalone create_hearing_poll tool and discord_commands.
 */

const { createHearingPollInChannel } = require('../../commands/poll/create');
const { LOG_PREFIX } = require('../helpers/helpers');

/**
 * Run create-hearing-poll logic. Call from create_hearing_poll tool or discord_commands.
 * @param {Object} context - { message, client }
 * @param {{ question: string, duration: number, anonymous: boolean }} params
 * @returns {Promise<{ success: boolean, error?: string, messageId?: string, message?: string, hint?: string }>}
 */
async function handleCreateHearingPoll(context, { question, duration, anonymous }) {
    const { message, client } = context;
    const channelName = message?.channel?.name ?? 'dm';
    const authorTag = message?.author?.tag ?? 'unknown';
    console.log(`${LOG_PREFIX} create_hearing_poll requested by @${authorTag} in #${channelName}: question="${typeof question === 'string' ? question.slice(0, 60) : ''}${typeof question === 'string' && question.length > 60 ? '…' : ''}" duration=${duration} anonymous=${anonymous}`);

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

    const dur = typeof duration === 'number' && duration >= 0 ? Math.min(duration, 10080) : 0;
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
}

module.exports = { handleCreateHearingPoll };
