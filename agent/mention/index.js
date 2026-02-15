const { handleMention } = require('./handlers');
const { isChannelAllowed, DEFAULT_MENTION_CHANNEL_NAMES } = require('./config');

module.exports = {
    handleMention,
    isChannelAllowed,
    DEFAULT_MENTION_CHANNEL_NAMES
};
