/**
 * stop_listening: turn listening off for the current voice session (if in VC and currently listening).
 */

const { tool } = require('ai');
const z = require('zod');
const { getSession, setListening } = require('../abilities/voice');
const { stopPipeline } = require('../abilities/voice/pipeline');
const { getToolDescription } = require('./helpers/helpers');

function buildStopListeningTool(context) {
    const { message } = context;
    return tool({
        description: getToolDescription('stop_listening'),
        parameters: z.object({}),
        execute: async () => {
            if (!message?.guild) {
                return { success: false, error: 'Use this in a server.' };
            }
            const guildId = message.guild.id;
            const session = getSession(guildId);
            if (!session) {
                return { success: false, error: "I'm not in a voice channel." };
            }
            if (!session.listening) {
                return { success: true, message: "I'm already not listening." };
            }
            setListening(guildId, false);
            stopPipeline(guildId);
            return { success: true, message: 'Stopped listening.' };
        },
    });
}

module.exports = { buildStopListeningTool };
