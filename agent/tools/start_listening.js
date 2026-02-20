/**
 * start_listening: turn listening on for the current voice session (if in VC and not already listening).
 */

const { tool } = require('ai');
const z = require('zod');
const { getSession, setListening } = require('../abilities/voice');
const { startPipeline } = require('../abilities/voice/pipeline');
const { getToolDescription } = require('./helpers/helpers');

function buildStartListeningTool(context) {
    const { message, client } = context;
    return tool({
        description: getToolDescription('start_listening'),
        parameters: z.object({}),
        execute: async () => {
            if (!message?.guild) {
                return { success: false, error: 'Use this in a server.' };
            }
            const guildId = message.guild.id;
            const session = getSession(guildId);
            if (!session) {
                return { success: false, error: "I'm not in a voice channel. Say \"hang out in voice\" first." };
            }
            if (session.listening) {
                return { success: true, message: "I'm already listening." };
            }
            const setResult = setListening(guildId, true);
            if (!setResult.success) {
                return { success: false, error: setResult.error };
            }
            startPipeline(session, client);
            return { success: true, message: 'Started listening.' };
        },
    });
}

module.exports = { buildStartListeningTool };
