/**
 * discord_commands tool: run Discord commands via subtools (e.g. create_hearing_poll).
 * Uses a discriminated union so each command has only its own parameters; scales with more subtools.
 *
 * To add a subtool:
 * 1. Add a handler in tools/subtools/<name>.js (e.g. handleCreateTimer) and optionally refactor
 *    the standalone tool to call it so logic lives in one place.
 * 2. Add a variant to discordCommandsSchema: z.object({ command: z.literal('my_command'), ...params }).
 * 3. Require the handler above and add a branch in execute that calls it with context and payload.
 */

const { tool } = require('ai');
const z = require('zod');
const { getToolDescription } = require('./helpers/helpers');
const { handleCreateHearingPoll } = require('./subtools/create_hearing_poll');

const discordCommandsSchema = z.discriminatedUnion('command', [
    z.object({
        command: z.literal('create_hearing_poll'),
        question: z.string().min(1).describe('The poll question or topic'),
        duration: z.number().min(0).describe('Duration in minutes; use 0 for no time limit'),
        anonymous: z.boolean().describe('Whether to hide voter names; use false for public votes'),
    }),
    // Example: add another command by adding a variant and a branch in execute:
    // z.object({
    //     command: z.literal('create_timer'),
    //     durationMinutes: z.number().min(0).max(1440),
    //     isPopeyesTimer: z.boolean(),
    //     reminderMessage: z.string(),
    //     replyInChannel: z.boolean(),
    // }),
]);

function buildDiscordCommandsTool(context) {
    return tool({
        description: getToolDescription('discord_commands'),
        parameters: discordCommandsSchema,
        execute: async (payload) => {
            if (payload.command === 'create_hearing_poll') {
                return handleCreateHearingPoll(context, {
                    question: payload.question,
                    duration: payload.duration,
                    anonymous: payload.anonymous,
                });
            }
            // if (payload.command === 'create_timer') {
            //     return handleCreateTimer(context, { ... });
            // }
            return { error: 'Unknown command.' };
        },
    });
}

module.exports = { buildDiscordCommandsTool };
