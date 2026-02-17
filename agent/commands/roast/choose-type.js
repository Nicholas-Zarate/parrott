/**
 * Choose roast type by weighted random. Respects eligibility (messages available, game_streak threshold).
 * @param {{ weight_messages: number, weight_game_streak: number, weight_custom: number, game_streak_min_activities: number }} weights
 * @param {{ hasMessages: boolean, activityCount: number }} eligibility
 * @returns {'messages'|'game_streak'|'custom'}
 */
function chooseRoastType(weights, eligibility) {
    const { hasMessages, activityCount } = eligibility;
    const minActivities = Math.max(0, Number(weights.game_streak_min_activities) || 5);

    let wMessages = Math.max(0, Number(weights.weight_messages) || 0);
    let wGameStreak = Math.max(0, Number(weights.weight_game_streak) || 0);
    let wCustom = Math.max(0, Number(weights.weight_custom) || 0);

    if (!hasMessages) wMessages = 0;
    if (activityCount < minActivities) wGameStreak = 0;

    const sum = wMessages + wGameStreak + wCustom;
    if (sum <= 0) return 'custom';

    const r = Math.random() * sum;
    if (r < wMessages) return 'messages';
    if (r < wMessages + wGameStreak) return 'game_streak';
    return 'custom';
}

module.exports = { chooseRoastType };
