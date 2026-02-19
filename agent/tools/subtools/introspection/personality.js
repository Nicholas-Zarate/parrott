/**
 * Introspection subtool: return role and voice from system prompt sections.
 */

const parrotConfig = require('../../../config/parrot');

function handlePersonality() {
    const sections = parrotConfig.getSystemPromptSections();
    const out = {
        role: sections.role ?? '',
        voice: sections.voice ?? '',
    };
    if (sections.voiceWeights) out.voiceWeights = sections.voiceWeights;
    if (sections.toolVoiceWeights) out.toolVoiceWeights = sections.toolVoiceWeights;
    return out;
}

module.exports = { handlePersonality };
