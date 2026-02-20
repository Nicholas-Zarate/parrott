/**
 * join_voice_and_squawk tool: join VC and speak (custom phrase or holla).
 */

const { tool } = require('ai');
const z = require('zod');
const { playInVoiceChannel, playInSession, getSession } = require('../abilities/voice');
const { generateHollaResponse, FALLBACK_PHRASE } = require('../abilities/voice/holla');
const { getToolDescription, LOG_PREFIX, resolveVoiceChannelForMemberWithFetch } = require('./helpers/helpers');

function buildJoinVoiceAndSquawkTool(context) {
    const { message, client } = context;
    return tool({
        description: getToolDescription('join_voice_and_squawk'),
        parameters: z.object({
            customMessage: z.string().describe('For "say <phrase>": the phrase to speak (e.g. "say we won" → "we won"). For "holla at me": pass empty string so a greeting or game line is generated. For voice-delivery requests: the full line to speak (your composed response or a witty alternative—do not ask the user for clarification).'),
        }),
        execute: async ({ customMessage }) => {
            const channelName = message?.channel?.name ?? 'dm';
            const authorTag = message?.author?.tag ?? 'unknown';
            console.log(`${LOG_PREFIX} join_voice_and_squawk requested by @${authorTag} in #${channelName}`);

            if (!message || !client) {
                console.log(`${LOG_PREFIX} join_voice_and_squawk failed: missing Discord context`);
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
                console.log(`${LOG_PREFIX} join_voice_and_squawk skipped: @${authorTag} not in a voice channel (guild=${guild.id} userId=${message.author.id} voiceStatesCacheSize=${voiceCacheSize} userInVoiceCache=${userInVoiceCache})`);
                return {
                    success: false,
                    error: "You're not in a voice channel. Join a voice channel first, then ask again.",
                    hint: "Tell the user to join a voice channel and say the same thing again. If they're already in a voice channel, suggest they wait a second and try again.",
                };
            }

            const custom = typeof customMessage === 'string' ? customMessage.trim() : '';
            let textToSpeak;
            if (custom.length > 0) {
                textToSpeak = custom;
                console.log(`${LOG_PREFIX} join_voice_and_squawk say: "${textToSpeak}"`);
            } else {
                textToSpeak = await generateHollaResponse(voiceChannel, client.user?.id);
                console.log(`${LOG_PREFIX} join_voice_and_squawk holla: "${textToSpeak.slice(0, 60)}${textToSpeak.length > 60 ? '…' : ''}"`);
            }

            if (!textToSpeak || !String(textToSpeak).trim()) {
                textToSpeak = FALLBACK_PHRASE;
            }

            const session = getSession(guild.id);
            if (session) {
                console.log(`${LOG_PREFIX} join_voice_and_squawk session exists, playing in session for @${authorTag}`);
                try {
                    const result = await playInSession(session, textToSpeak);
                    if (result.success) {
                        return { success: true, message: 'Spoke in voice chat.' };
                    }
                    return { success: false, error: result.error || 'Failed to play sound.' };
                } catch (err) {
                    console.error(`${LOG_PREFIX} join_voice_and_squawk playInSession error:`, err?.message || err);
                    return { success: false, error: err?.message || 'Voice error. Try again.' };
                }
            }

            console.log(`${LOG_PREFIX} join_voice_and_squawk joining VC "${voiceChannel.name}" for @${authorTag}`);
            try {
                const result = await playInVoiceChannel(client, voiceChannel, { type: 'tts', text: textToSpeak });
                if (result.success) {
                    console.log(`${LOG_PREFIX} join_voice_and_squawk success for @${authorTag}`);
                    return { success: true, message: 'Joined, spoke, and left.' };
                }
                console.log(`${LOG_PREFIX} join_voice_and_squawk failed: ${result.error}`);
                return { success: false, error: result.error || 'Failed to play sound.' };
            } catch (err) {
                console.error(`${LOG_PREFIX} join_voice_and_squawk error:`, err?.message || err);
                return { success: false, error: err?.message || 'Voice error. Try again.' };
            }
        },
    });
}

module.exports = { buildJoinVoiceAndSquawkTool };
