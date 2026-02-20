/**
 * Voice module: join a voice channel, play audio (TTS or file), then leave.
 * Also: voice session (hang out, listen, record) via session.js.
 */

const { playSquawkInChannel, playInVoiceChannel, playInSession } = require('./play');
const { getMostCommonGameInVoiceChannel } = require('./getGameInChannel');
const { playStallInVoice, getStallMessage } = require('./stall');
const { getSession, startSession, endSession, setListening } = require('./session');

module.exports = {
    playSquawkInChannel,
    playInVoiceChannel,
    playInSession,
    playStallInVoice,
    getStallMessage,
    getMostCommonGameInVoiceChannel,
    getSession,
    startSession,
    endSession,
    setListening,
};
