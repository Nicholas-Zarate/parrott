/**
 * Vercel AI SDK integration with tools that can call command-like logic.
 * Use this for @mention or other flows where the model should be able to
 * trigger roasts, analysis, polls, research, etc. via tool calls.
 *
 * Requires: ai, @ai-sdk/openai, @ai-sdk/anthropic, zod
 * Env: OPENAI_API_KEY (OpenAI), ANTHROPIC_API_KEY (Claude), XAI_API_KEY (Grok). Optional: OPENAI_MODEL (overrides default). Default model: grok-4-1-fast-non-reasoning. TAVILY_API_KEY (for search_web research).
 */

const { generateText } = require('ai');
const { getModel } = require('./model-provider');
const roastConfig = require('../config/roast');
const parrotConfig = require('../config/parrot');
const { LOG_PREFIX } = require('../tools/helpers/helpers');
const { buildRunRoastTool } = require('../tools/run_roast');
const { buildSearchWebTool } = require('../tools/search_web');
const { buildCreateHearingPollTool } = require('../tools/create_hearing_poll');
const { buildCreateTimerTool } = require('../tools/create_timer');
const { buildJoinVoiceAndSquawkTool } = require('../tools/join_voice_and_squawk');
const { buildSingSongTool } = require('../tools/sing_song');
const { buildEchoTool } = require('../tools/echo');
const { buildIntrospectionTool } = require('../tools/introspection');
const { buildDiscordCommandsTool } = require('../tools/discord_commands');

const MAX_STEPS = 5;

/**
 * Build the tools object. Each tool's execute() can call existing command logic.
 * Context { message, client } is closed over so tools can access Discord channel and author.
 *
 * @param {Object} context - { message, client } (Discord context for resolving guild, replying, etc.)
 * @returns {Object} tools map for generateText
 */
function buildTools(context = {}) {
    return {
        run_roast: buildRunRoastTool(context),
        search_web: buildSearchWebTool(context),
        create_hearing_poll: buildCreateHearingPollTool(context),
        create_timer: buildCreateTimerTool(context),
        join_voice_and_squawk: buildJoinVoiceAndSquawkTool(context),
        sing_song: buildSingSongTool(context),
        echo: buildEchoTool(context),
        introspection: buildIntrospectionTool(context),
        discord_commands: buildDiscordCommandsTool(context),
    };
}

/**
 * Run chat with tools. Tools can call roast/analysis/poll logic; context provides Discord access.
 *
 * @param {Array<{ role: string, content: string }>} messages - Chat messages (e.g. system + user)
 * @param {Object} context - { message, client } for tool execution
 * @param {{ model?: string, maxTokens?: number }} [options] - Optional model ID and max tokens (default from env / roastConfig)
 * @returns {Promise<{ text: string, steps?: Array }>}
 */
async function chatWithTools(messages, context = {}, options = {}) {
    const modelId = options.model ?? parrotConfig.model;
    console.log(`${LOG_PREFIX} chatWithTools using model "${modelId ?? '(model-provider default)'}"`);
    const model = getModel(modelId);
    const tools = buildTools(context);
    const maxTokens = options.maxTokens ?? parrotConfig.max_completion_tokens ?? roastConfig.max_completion_tokens ?? 256;

    const result = await generateText({
        model,
        messages,
        tools,
        maxSteps: MAX_STEPS,
        maxTokens,
    });

    return {
        text: result.text,
        steps: result.steps,
        response: result.response,
    };
}

module.exports = {
    chatWithTools,
    buildTools,
};
