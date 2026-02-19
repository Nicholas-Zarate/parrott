/**
 * introspection tool: personality, model, or tools metadata (uses subtools for each query type).
 */

const { tool } = require('ai');
const z = require('zod');
const { getToolDescription } = require('./helpers/helpers');
const { handlePersonality } = require('./subtools/introspection/personality');
const { handleModel } = require('./subtools/introspection/model');
const { handleToolsList } = require('./subtools/introspection/tools-list');

function buildIntrospectionTool(context) {
    return tool({
        description: getToolDescription('introspection'),
        parameters: z.object({
            query: z.enum(['personality', 'model', 'tools']).describe('personality: return role and voice; model: return current AI model and provider; tools: return list of available tools with description and example'),
        }),
        execute: async ({ query }) => {
            if (query === 'personality') return handlePersonality();
            if (query === 'model') return handleModel();
            if (query === 'tools') return handleToolsList();
            return { error: 'Unknown query.' };
        },
    });
}

module.exports = { buildIntrospectionTool };
