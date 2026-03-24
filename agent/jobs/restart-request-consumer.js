/**
 * Restart request consumer: polls restart_requests for pending rows,
 * sends message to Discord (voice or #parrot) notifying the overseer role.
 * Call startRestartRequestConsumer(client) once on bot ready.
 */

const { getClient } = require('../database/supabase/client');
const { playInVoiceChannel } = require('../abilities/voice/play');

const LOG = '[RestartRequest]';
const TABLE = 'restart_requests';
const POLL_INTERVAL_MS = Number(process.env.RESTART_REQUEST_POLL_INTERVAL_MS) || 15000;
const PARROT_CHANNEL_NAME = process.env.RESTART_REQUEST_PARROT_CHANNEL_NAME || 'parrot';
const VOICE_CHANNEL_NAME = process.env.RESTART_REQUEST_VOICE_CHANNEL_NAME || null; // null = first VC
const OVERSEER_ROLE_NAMES = ['overseer', ':overseer'];

let _intervalId = null;
let _pollRunCount = 0;

/**
 * Find the overseer role in a guild (by name).
 * @param {import('discord.js').Guild} guild
 * @returns {import('discord.js').Role | null}
 */
function findOverseerRole(guild) {
    if (!guild?.roles?.cache) return null;
    return guild.roles.cache.find((r) => {
        const name = (r.name || '').trim().toLowerCase();
        return OVERSEER_ROLE_NAMES.some((n) => n.toLowerCase() === name);
    }) ?? null;
}

/**
 * Find a text channel by name (excludes categories).
 * @param {import('discord.js').Guild} guild
 * @param {string} channelName - Without #, e.g. 'parrot'
 * @returns {import('discord.js').TextChannel | null}
 */
function findTextChannelByName(guild, channelName) {
    if (!channelName || !guild?.channels?.cache) return null;
    return guild.channels.cache.find(
        (c) => c.isTextBased() && c.type !== 4 && (c.name || '').toLowerCase() === channelName.toLowerCase()
    ) ?? null;
}

/**
 * Find a voice channel: by name if configured, else first available.
 * @param {import('discord.js').Guild} guild
 * @returns {import('discord.js').VoiceChannel | null}
 */
function findVoiceChannel(guild) {
    if (!guild?.channels?.cache) return null;
    const voiceChannels = guild.channels.cache.filter((c) => c.isVoiceBased?.() ?? c.type === 2);
    if (VOICE_CHANNEL_NAME) {
        const found = voiceChannels.find((c) => (c.name || '').toLowerCase() === VOICE_CHANNEL_NAME.toLowerCase());
        if (found) return found;
    }
    return voiceChannels.first() ?? null;
}

/**
 * Process one pending restart request. Returns true if processed (sent or failed), false if none found.
 * @param {import('discord.js').Client} client
 * @returns {Promise<boolean>}
 */
async function processOne(client) {
    const supabase = getClient();
    if (!supabase) return false;

    const { data: rows, error: fetchError } = await supabase
        .from(TABLE)
        .select('id, guild_id, target, message')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(1);

    if (fetchError) {
        console.error(`${LOG} Fetch error:`, fetchError.message);
        return false;
    }
    const pendingCount = Array.isArray(rows) ? rows.length : 0;
    if (pendingCount === 0) {
        return false;
    }

    const row = rows[0];
    console.log(`${LOG} Processing pending request id=${row.id} target=${row.target} guild_id=${row.guild_id ?? 'null'}`);
    const guildId = row.guild_id?.trim() || process.env.RESTART_REQUEST_DEFAULT_GUILD_ID?.trim();
    let guild = guildId ? client.guilds.cache.get(guildId) : null;
    if (!guild && !guildId) {
        guild = client.guilds.cache.first() ?? null;
    }
    if (!guild) {
        console.log(`${LOG} No guild for request ${row.id} (guild_id=${row.guild_id}). Marking failed.`);
        await supabase.from(TABLE).update({ status: 'failed' }).eq('id', row.id);
        return true;
    }
    console.log(`${LOG} Using guild: ${guild.name} (${guild.id})`);

    const role = findOverseerRole(guild);
    const roleMention = role ? `<@&${role.id}>` : '';

    try {
        if (row.target === 'parrot') {
            const channel = findTextChannelByName(guild, PARROT_CHANNEL_NAME);
            if (!channel) {
                console.log(`${LOG} No channel "${PARROT_CHANNEL_NAME}" in ${guild.name}. Marking failed.`);
                await supabase.from(TABLE).update({ status: 'failed' }).eq('id', row.id);
                return true;
            }
            const content = roleMention ? `${roleMention} ${row.message}` : row.message;
            console.log(`${LOG} Sending to #${channel.name} (${channel.id}) in ${guild.name}…`);
            await channel.send({ content: content.slice(0, 2000) || '—' });
            console.log(`${LOG} Sent to #${channel.name} in ${guild.name}.`);
        } else if (row.target === 'voice') {
            const voiceChannel = findVoiceChannel(guild);
            if (!voiceChannel) {
                console.log(`${LOG} No voice channel in ${guild.name}. Marking failed.`);
                await supabase.from(TABLE).update({ status: 'failed' }).eq('id', row.id);
                return true;
            }
            console.log(`${LOG} Sending TTS to voice channel ${voiceChannel.name} (${voiceChannel.id}) in ${guild.name}…`);
            const result = await playInVoiceChannel(client, voiceChannel, {
                type: 'tts',
                text: row.message || "Someone's gotta restart the server.",
            });
            if (!result.success) {
                console.error(`${LOG} Voice TTS failed: ${result.error}`);
                await supabase.from(TABLE).update({ status: 'failed' }).eq('id', row.id);
                return true;
            }
            console.log(`${LOG} TTS sent in ${voiceChannel.name} (${guild.name}).`);
            // Also post to #parrot so there's a text record.
            const textChannel = findTextChannelByName(guild, PARROT_CHANNEL_NAME);
            if (textChannel) {
                const content = roleMention ? `${roleMention} ${row.message}` : row.message;
                await textChannel.send({ content: (content || row.message || '—').slice(0, 2000) });
                console.log(`${LOG} Also sent to #${textChannel.name} (voice job).`);
            } else {
                console.log(`${LOG} No #${PARROT_CHANNEL_NAME} for text copy; voice-only.`);
            }
        } else {
            await supabase.from(TABLE).update({ status: 'failed' }).eq('id', row.id);
            return true;
        }

        const { error: updateErr } = await supabase.from(TABLE).update({ status: 'sent' }).eq('id', row.id);
        if (updateErr) {
            console.error(`${LOG} Failed to mark id=${row.id} as sent:`, updateErr.message);
        } else {
            console.log(`${LOG} Marked request id=${row.id} as sent.`);
        }
    } catch (err) {
        console.error(`${LOG} Send error:`, err?.message || err);
        await supabase.from(TABLE).update({ status: 'failed' }).eq('id', row.id).catch(() => {});
    }
    return true;
}

/**
 * Start polling for pending restart requests. Safe to call once (only starts once).
 * @param {import('discord.js').Client} client
 */
function startRestartRequestConsumer(client) {
    if (_intervalId != null) return;

    const supabase = getClient();
    if (!supabase) {
        console.log(`${LOG} Supabase not configured; restart request consumer disabled.`);
        return;
    }

    const usingServiceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
    console.log(
        `${LOG} Consumer started (poll every ${POLL_INTERVAL_MS / 1000}s). ` +
        `DB access: ${usingServiceRole ? 'SUPABASE_SERVICE_ROLE_KEY (can read/update restart_requests)' : 'SUPABASE_ANON_KEY only — RLS will block reads; set SUPABASE_SERVICE_ROLE_KEY for restart requests.'}`
    );

    _intervalId = setInterval(async () => {
        _pollRunCount++;
        try {
            const hadWork = await processOne(client);
            if (!hadWork && _pollRunCount % 20 === 1) {
                console.log(`${LOG} Poll #${_pollRunCount}: no pending restart requests.`);
            }
        } catch (err) {
            console.error(`${LOG} Poll error:`, err?.message || err);
        }
    }, POLL_INTERVAL_MS);
}

module.exports = {
    startRestartRequestConsumer,
    processOne,
};
