/**
 * Introspection subtool: return current AI model and provider.
 */

const parrotConfig = require('../../config/parrot');
const { getProviderLabel, DEFAULT_MODEL } = require('../../ai-sdk/model-provider');

function handleModel() {
    const modelId = parrotConfig.model || DEFAULT_MODEL;
    return {
        model: modelId,
        provider: getProviderLabel(modelId),
    };
}

module.exports = { handleModel };
