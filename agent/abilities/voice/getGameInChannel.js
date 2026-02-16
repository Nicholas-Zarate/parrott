/**
 * Get the most common "Playing" game/activity name in a voice channel.
 * Used to generate a game-based roast for the voice squawk tool.
 *
 * Requires GuildPresences intent. Activity type 0 = Playing.
 *
 * @param {import('discord.js').VoiceChannel} voiceChannel
 * @param {string} [botUserId] - Bot's user ID to exclude from count
 * @returns {string | null} Most common game name, or null if none
 */
function getMostCommonGameInVoiceChannel(voiceChannel, botUserId) {
    if (!voiceChannel?.members) return null;

    const countByGame = new Map();

    for (const [memberId, member] of voiceChannel.members) {
        if (botUserId && memberId === botUserId) continue;
        const activities = member.presence?.activities;
        if (!activities || !Array.isArray(activities)) continue;
        for (const a of activities) {
            if (a.type !== 0) continue; // 0 = Playing
            const name = (a.name || '').trim();
            if (!name) continue;
            countByGame.set(name, (countByGame.get(name) || 0) + 1);
        }
    }

    if (countByGame.size === 0) return null;

    let topName = null;
    let topCount = 0;
    for (const [name, count] of countByGame) {
        if (count > topCount) {
            topCount = count;
            topName = name;
        }
    }
    return topName;
}

module.exports = {
    getMostCommonGameInVoiceChannel,
};
