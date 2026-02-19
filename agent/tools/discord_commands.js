/**
 * discord_commands tool: run Discord commands via subtools (e.g. create_hearing_poll).
 * Schema is a single z.object (OpenAI requires parameters schema type "object"; union types are rejected).
 *
 * To add a subtool:
 * 1. Add a handler in tools/subtools/<name>.js (e.g. handleCreateTimer) and optionally refactor
 *    the standalone tool to call it so logic lives in one place.
 * 2. Add command to discordCommandsSchema: z.enum([..., 'my_command']) and add optional params for that command.
 * 3. Require the handler above and add a branch in execute that calls it with context and payload.
 */

const { tool } = require('ai');
const z = require('zod');
const { getToolDescription } = require('./helpers/helpers');
const { handleCreateHearingPoll } = require('./subtools/create_hearing_poll');

// Single z.object so OpenAI gets a JSON Schema with type "object" (discriminatedUnion becomes oneOf and is rejected).
// To add a command: add optional params here and a branch in execute.
const discordCommandsSchema = z.object({
    command: z.enum(['create_hearing_poll']).describe('The discord command to run'),
    question: z.string().min(1).describe('The poll question or topic'),
    duration: z.number().min(0).describe('Duration in minutes; use 0 for no time limit'),
    anonymous: z.boolean().describe('Whether to hide voter names; use false for public votes'),
});

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
