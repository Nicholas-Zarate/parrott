/**
 * chooseRoastType: weighted selection and eligibility.
 * Run from agent/: node test/choose-roast-type.test.js
 */
const assert = require('assert');
const { chooseRoastType } = require('../commands/roast/choose-type');

const defaultWeights = {
    weight_messages: 60,
    weight_game_streak: 10,
    weight_custom: 30,
    game_streak_min_activities: 5,
};

function run() {
    // When no messages and no activities, only custom is eligible
    for (let i = 0; i < 50; i++) {
        const type = chooseRoastType(defaultWeights, { hasMessages: false, activityCount: 0 });
        assert.strictEqual(type, 'custom', 'with no messages and no activities always returns custom');
    }

    // When activityCount < min_activities, game_streak weight is 0
    for (let i = 0; i < 100; i++) {
        const type = chooseRoastType(defaultWeights, { hasMessages: true, activityCount: 2 });
        assert(type === 'messages' || type === 'custom', 'with 2 activities (min 5) never returns game_streak');
    }

    // When only custom has weight, always custom
    const onlyCustom = { ...defaultWeights, weight_messages: 0, weight_game_streak: 0, weight_custom: 100 };
    for (let i = 0; i < 20; i++) {
        const type = chooseRoastType(onlyCustom, { hasMessages: true, activityCount: 10 });
        assert.strictEqual(type, 'custom', 'weight only on custom returns custom');
    }

    // When only messages has weight and hasMessages true, only messages or custom (custom is 0 so only messages)
    const onlyMessages = { ...defaultWeights, weight_messages: 100, weight_game_streak: 0, weight_custom: 0 };
    for (let i = 0; i < 20; i++) {
        const type = chooseRoastType(onlyMessages, { hasMessages: true, activityCount: 0 });
        assert.strictEqual(type, 'messages', 'only messages weight and hasMessages returns messages');
    }

    // When only game_streak has weight and eligible (activityCount >= min), we get game_streak
    const onlyGameStreak = { ...defaultWeights, weight_messages: 0, weight_game_streak: 100, weight_custom: 0 };
    let gotGameStreak = false;
    for (let i = 0; i < 50; i++) {
        const type = chooseRoastType(onlyGameStreak, { hasMessages: false, activityCount: 6 });
        assert(type === 'game_streak' || type === 'custom', 'only game_streak weight with 6 activities returns game_streak or custom (custom has 0 weight so only game_streak)');
        if (type === 'game_streak') gotGameStreak = true;
    }
    assert(gotGameStreak, 'at least one game_streak in 50 runs');

    // When only game_streak weight but activityCount 3 < min 5, fallback to custom (only option)
    for (let i = 0; i < 20; i++) {
        const type = chooseRoastType(onlyGameStreak, { hasMessages: false, activityCount: 3 });
        assert.strictEqual(type, 'custom', 'game_streak ineligible (3 < 5) with no messages returns custom');
    }

    // Return value is one of the three
    const valid = ['messages', 'game_streak', 'custom'];
    for (let i = 0; i < 30; i++) {
        const type = chooseRoastType(defaultWeights, { hasMessages: true, activityCount: 7 });
        assert(valid.includes(type), `type ${type} is one of ${valid.join(', ')}`);
    }

    console.log('choose-roast-type test: OK');
}

run();
