/**
 * create_hearing_poll tool: create a hearing poll in the channel.
 */

const { tool } = require('ai');
const z = require('zod');
const { getToolDescription } = require('./helpers/helpers');
const { handleCreateHearingPoll } = require('./subtools/create_hearing_poll');

function buildCreateHearingPollTool(context) {
    return tool({
        description: getToolDescription('create_hearing_poll'),
        parameters: z.object({
            question: z.string().min(1).describe('The poll question or topic'),
            duration: z.number().min(0).describe('Duration in minutes; use 0 for no time limit'),
            anonymous: z.boolean().describe('Whether to hide voter names; use false for public votes'),
        }),
        execute: async ({ question, duration, anonymous }) => handleCreateHearingPoll(context, { question, duration, anonymous }),
    });
}

module.exports = { buildCreateHearingPollTool };
