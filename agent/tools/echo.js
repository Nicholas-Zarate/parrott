/**
 * echo tool: echo back short text (simple test/debug).
 */

const { tool } = require('ai');
const z = require('zod');
const { getToolDescription } = require('./helpers/helpers');

function buildEchoTool(context) {
    return tool({
        description: getToolDescription('echo'),
        parameters: z.object({
            text: z.string().describe('The short text to echo back'),
        }),
        execute: async ({ text }) => {
            return { echoed: text };
        },
    });
}

module.exports = { buildEchoTool };
