/**
 * Shared helpers for Parrott tools. Used by tool modules and with-tools.js.
 */

const { ChannelType } = require('discord.js');
const parrotConfig = require('../../config/parrot');

const LOG_PREFIX = '[Parrott tools]';

function getToolDescription(toolSlug) {
    const fromDb = parrotConfig.getToolDescriptions()[toolSlug];
    return (fromDb != null && String(fromDb).trim()) ? String(fromDb).trim() : '';
}

/**
 * Resolve the voice channel the member is in.
 * @param {import('discord.js').Guild} guild
 * @param {import('discord.js').GuildMember} member
 * @returns {import('discord.js').VoiceChannel | null}
 */
function resolveVoiceChannelForMember(guild, member) {
    if (!guild || !member) return null;
    let channel = member.voice?.channel ?? null;
    if (channel) return channel;
    const voiceState = guild.voiceStates?.cache?.get(member.id);
    if (voiceState?.channel) return voiceState.channel;
    const channels = guild.channels?.cache;
    if (!channels) return null;
    for (const [, ch] of channels) {
        if (ch.type === ChannelType.GuildVoice && ch.members?.has(member.id)) return ch;
    }
    return null;
}

/**
 * Resolve voice channel with REST fallback and optional retry.
 * @param {import('discord.js').Guild} guild
 * @param {import('discord.js').GuildMember} member
 * @returns {Promise<import('discord.js').VoiceChannel | null>}
 */
async function resolveVoiceChannelForMemberWithFetch(guild, member) {
    let channel = resolveVoiceChannelForMember(guild, member);
    if (channel) return channel;
    try {
        await guild.voiceStates.fetch(member.id);
        channel = resolveVoiceChannelForMember(guild, member);
        if (channel) return channel;
    } catch (_) {
        // REST may not support fetching another user's voice state
    }
    await new Promise((r) => setTimeout(r, 1500));
    try {
        await guild.voiceStates.fetch(member.id);
    } catch (_) {
        /* ignore */
    }
    return resolveVoiceChannelForMember(guild, member);
}

module.exports = {
    LOG_PREFIX,
    getToolDescription,
    resolveVoiceChannelForMember,
    resolveVoiceChannelForMemberWithFetch,
};
