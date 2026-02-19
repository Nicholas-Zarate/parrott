/**
 * run_roast tool: roast a user by ID (from @mention) or by plain name.
 */

const { tool } = require('ai');
const z = require('zod');
const roastConfig = require('../config/roast');
const parrotConfig = require('../config/parrot');
const { requestRoast, getOpenAIErrorMessage } = require('../commands/roast/openai');
const { formatUserDataForLLM, formatActivityOnlyForLLM } = require('../commands/roast/format');
const { collectUserDataForRoast } = require('../commands/roast/collect');
const { chooseRoastType } = require('../commands/roast/choose-type');
const { getToolDescription, LOG_PREFIX } = require('./helpers/helpers');

function buildRunRoastTool(context) {
    const { message, client } = context;
    return tool({
        description: getToolDescription('run_roast'),
        parameters: z.object({
            targetUserId: z.string().optional().describe('Discord user ID when the user @mentioned someone (e.g. "roast @Harol" — pass the mentioned user\'s ID)'),
            targetUserName: z.string().optional().describe('Plain name when no @mention (e.g. "roast Harol" — pass "Harol"; do not try to resolve to a Discord user)'),
        }),
        execute: async ({ targetUserId, targetUserName }) => {
            const hasUserId = typeof targetUserId === 'string' && targetUserId.trim().length > 0;
            const hasName = typeof targetUserName === 'string' && targetUserName.trim().length > 0;
            if (!hasUserId && !hasName) {
                return { success: false, error: 'Provide either targetUserId (from @mention) or targetUserName (plain name, e.g. "Harol").' };
            }

            const days = 7;
            const scope = 'server';
            const channelName = message?.channel?.name ?? 'dm';
            console.log(`${LOG_PREFIX} run_roast requested ${hasUserId ? `targetUserId=${targetUserId}` : `targetUserName=${targetUserName}`} days=${days} scope=${scope} in #${channelName}`);
            if (!message || !client) {
                console.log(`${LOG_PREFIX} run_roast failed: missing Discord context`);
                return { success: false, error: 'Missing Discord context (message/client).' };
            }

            if (!hasUserId && hasName) {
                const name = targetUserName.trim();
                try {
                    const requestConfig = { ...roastConfig, roastType: 'custom', displayName: name };
                    const { content } = await requestRoast('', requestConfig);
                    console.log(`${LOG_PREFIX} run_roast success (name-only) for "${name}" type=custom`);
                    return { success: true, roast: content };
                } catch (err) {
                    console.error(`${LOG_PREFIX} run_roast error (name-only):`, err.message || err, err.detail || '');
                    const userMsg = getOpenAIErrorMessage(err);
                    return { success: false, error: userMsg };
                }
            }

            const guild = message.guild;
            if (!guild) {
                return { success: false, error: 'This command must be used in a server channel.' };
            }

            let targetUser = client.users.cache.get(targetUserId);
            if (!targetUser) {
                try {
                    targetUser = await client.users.fetch(targetUserId);
                } catch (_) {
                    return { success: false, error: `User ${targetUserId} not found.` };
                }
            }

            try {
                const channelId = scope === 'channel' ? message.channelId : undefined;
                const { messages, activities, profile, roleNames, presence, stats } = await collectUserDataForRoast(guild, {
                    targetUserId,
                    targetUser,
                    days,
                    scope,
                    channelId,
                });

                const weights = parrotConfig.getRoastWeights();
                const roastType = chooseRoastType(weights, {
                    hasMessages: messages.length > 0,
                    activityCount: activities.length,
                });

                let userDataText;
                const requestConfig = { ...roastConfig, roastType, displayName: profile?.displayName || targetUser.username };

                if (roastType === 'messages') {
                    userDataText = formatUserDataForLLM({
                        userTag: targetUser.tag,
                        userId: targetUser.id,
                        profile,
                        roleNames,
                        presence,
                        activities,
                        messages,
                        stats,
                        days,
                        scope,
                        messageContextOnly: true,
                    });
                } else if (roastType === 'game_streak') {
                    userDataText = formatActivityOnlyForLLM({
                        userTag: targetUser.tag,
                        displayName: profile?.displayName || targetUser.username,
                        activities,
                    });
                } else {
                    userDataText = '';
                }

                const { content } = await requestRoast(userDataText, requestConfig);
                console.log(`${LOG_PREFIX} run_roast success for ${targetUserId} type=${roastType}`);
                return { success: true, roast: content };
            } catch (err) {
                console.error(`${LOG_PREFIX} run_roast error:`, err.message || err, err.detail || '');
                const userMsg = getOpenAIErrorMessage(err);
                return { success: false, error: userMsg };
            }
        },
    });
}

module.exports = { buildRunRoastTool };
