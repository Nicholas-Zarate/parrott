/**
 * hang_out_in_voice: join the user's VC and stay, start listening (STT).
 */

const { tool } = require('ai');
const z = require('zod');
const { getSession, startSession } = require('../abilities/voice');
const { playInSession } = require('../abilities/voice/play');
const { startPipeline } = require('../abilities/voice/pipeline');
const { getToolDescription, LOG_PREFIX, resolveVoiceChannelForMemberWithFetch } = require('./helpers/helpers');

function buildHangOutInVoiceTool(context) {
    const { message, client } = context;
    return tool({
        description: getToolDescription('hang_out_in_voice'),
        parameters: z.object({}),
        execute: async () => {
            if (!message || !client) {
                return { success: false, error: 'Missing Discord context.' };
            }
            const guild = message.guild;
            if (!guild) {
                return { success: false, error: 'Voice is only available in a server.' };
            }
            const member = message.member ?? await guild.members.fetch(message.author.id).catch(() => null);
            if (!member) {
                return { success: false, error: 'Could not find you in this server.' };
            }
            const voiceChannel = await resolveVoiceChannelForMemberWithFetch(guild, member);
            if (!voiceChannel) {
                return {
                    success: false,
                    error: "You're not in a voice channel. Join a voice channel first, then ask again.",
                };
            }

            const session = getSession(guild.id);
            if (session) {
                return {
                    success: true,
                    message: "I'm already in your voice channel. Say \"start listening\" if you want me to listen.",
                };
            }

            const result = await startSession(client, guild, voiceChannel, {
                textChannelId: message.channel?.id ?? null,
                startListening: true,
            });
            if (!result.success) {
                return { success: false, error: result.error || 'Failed to start session.' };
            }

            startPipeline(result.session, client);

            try {
                await playInSession(result.session, "I'm here, listening.");
            } catch (_) {
                /* non-fatal */
            }
            return { success: true, message: "I'm in your voice channel and listening. Say \"stop listening\" to pause, or \"start listening\" to resume." };
        },
    });
}

module.exports = { buildHangOutInVoiceTool };
