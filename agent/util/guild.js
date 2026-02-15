/**
 * Resolve a Guild from an interaction (cache or fetch).
 * Use when interaction.guild may be null (e.g. guild not cached).
 * @param {import('discord.js').Interaction} interaction
 * @param {import('discord.js').Client} client
 * @returns {Promise<import('discord.js').Guild|null>}
 */
async function resolveGuild(interaction, client) {
    if (interaction.guild) return interaction.guild;
    if (!interaction.guildId) return null;
    try {
        const channel = await client.channels.fetch(interaction.channelId);
        if (channel?.guild) return channel.guild;
    } catch (e) {
        console.error('resolveGuild via channel failed:', e.message || e);
    }
    try {
        return await client.guilds.fetch(interaction.guildId);
    } catch (e) {
        console.error('resolveGuild via guilds.fetch failed:', e.message || e);
    }
    return null;
}

module.exports = { resolveGuild };
