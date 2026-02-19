/**
 * sing_song tool: get lyrics and sing in VC via TTS.
 */

const { tool } = require('ai');
const z = require('zod');
const { playInVoiceChannel } = require('../abilities/voice');
const { getLyricsForSong } = require('../abilities/sing-song/get-lyrics');
const { getToolDescription, LOG_PREFIX, resolveVoiceChannelForMemberWithFetch } = require('./helpers/helpers');

function buildSingSongTool(context) {
    const { message, client } = context;
    return tool({
        description: getToolDescription('sing_song'),
        parameters: z.object({
            songQuery: z.string().min(1).describe('The song name or title the user asked to sing (e.g. "Never Gonna Give You Up", "Bohemian Rhapsody").'),
        }),
        execute: async ({ songQuery }) => {
            const channelName = message?.channel?.name ?? 'dm';
            const authorTag = message?.author?.tag ?? 'unknown';
            console.log(`${LOG_PREFIX} sing_song requested by @${authorTag} in #${channelName}: songQuery="${songQuery?.slice(0, 60)}${songQuery?.length > 60 ? '…' : ''}"`);

            if (!message || !client) {
                console.log(`${LOG_PREFIX} sing_song failed: missing Discord context`);
                return { success: false, error: 'Missing Discord context.' };
            }

            const guild = message.guild;
            if (!guild) {
                return { success: false, error: 'Voice is only available in a server. Use this in a server channel.' };
            }

            const member = message.member ?? await guild.members.fetch(message.author.id).catch(() => null);
            if (!member) {
                return { success: false, error: 'Could not find you in this server.' };
            }

            const voiceChannel = await resolveVoiceChannelForMemberWithFetch(guild, member);
            if (!voiceChannel) {
                const voiceCacheSize = guild.voiceStates?.cache?.size ?? 0;
                const userInVoiceCache = !!guild.voiceStates?.cache?.get(message.author.id);
                console.log(`${LOG_PREFIX} sing_song skipped: @${authorTag} not in a voice channel (guild=${guild.id} userId=${message.author.id} voiceStatesCacheSize=${voiceCacheSize} userInVoiceCache=${userInVoiceCache})`);
                return {
                    success: false,
                    error: "You're not in a voice channel. Join a voice channel first, then ask again.",
                    hint: "Tell the user to join a voice channel and say the same thing again. If they're already in a voice channel, suggest they wait a second and try again.",
                };
            }

            const lyricsResult = await getLyricsForSong(songQuery);
            if (!lyricsResult.success) {
                console.log(`${LOG_PREFIX} sing_song lyrics failed: ${lyricsResult.error}`);
                return { success: false, error: lyricsResult.error };
            }

            const lyric = lyricsResult.lyric;
            console.log(`${LOG_PREFIX} sing_song joining VC "${voiceChannel.name}" for @${authorTag}, lyric="${lyric.slice(0, 50)}${lyric.length > 50 ? '…' : ''}"`);
            try {
                const result = await playInVoiceChannel(client, voiceChannel, { type: 'tts', text: lyric });
                if (result.success) {
                    console.log(`${LOG_PREFIX} sing_song success for @${authorTag}`);
                    return { success: true, message: 'Sang in VC.' };
                }
                console.log(`${LOG_PREFIX} sing_song failed: ${result.error}`);
                return { success: false, error: result.error || 'Failed to play sound.' };
            } catch (err) {
                console.error(`${LOG_PREFIX} sing_song error:`, err?.message || err);
                return { success: false, error: err?.message || 'Voice error. Try again.' };
            }
        },
    });
}

module.exports = { buildSingSongTool };
