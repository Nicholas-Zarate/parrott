/**
 * Introspection subtool: return list of available tools with description and example.
 */

const parrotConfig = require('../../config/parrot');

function handleToolsList() {
    const metadata = parrotConfig.getToolMetadata();
    const tools = Object.entries(metadata).map(([name, meta]) => ({
        name,
        description: (meta && meta.description) ?? '',
        example: (meta && meta.example_command) ?? '',
        enabled: (meta && meta.enabled) !== false,
    }));
    return { tools };
}

module.exports = { handleToolsList };
