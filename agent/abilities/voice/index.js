/**
 * Voice module: join a voice channel, play audio (TTS or file), then leave.
 * Used by the join_voice_and_squawk tool (game roast or custom "say: ...").
 */

const { playSquawkInChannel, playInVoiceChannel } = require('./play');
const { getMostCommonGameInVoiceChannel } = require('./getGameInChannel');

module.exports = {
    playSquawkInChannel,
    playInVoiceChannel,
    getMostCommonGameInVoiceChannel,
};
