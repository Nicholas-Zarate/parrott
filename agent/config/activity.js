/**
 * Activity listener configuration.
 * Each trigger type can be independently enabled/disabled and has its own cooldown.
 * Used by the presenceUpdate handler to detect meaningful activity changes and react.
 */

module.exports = {
    /** Name of the dedicated channel where activity messages are sent. Bot will search for this channel name in the guild. */
    channelName: 'parrot-activity',

    /** Whether to DM the user in addition to the channel message. */
    dmUser: true,

    /** Whether to join the user's voice channel and TTS the message (only if user is in VC). */
    voiceIfConnected: true,

    /** Trigger definitions. Each trigger has: enabled (bool), cooldownMinutes (per-user per-trigger). */
    triggers: {
        /** React when a user starts playing a game (activity type 0 appears). */
        game_start: {
            enabled: true,
            cooldownMinutes: 90,
        },

        /** Tease users playing games between startHour and endHour (server-local or UTC). */
        late_night: {
            enabled: true,
            cooldownMinutes: 360,
            startHour: 0,
            endHour: 5,
        },

        /** Comment when a user has been playing the same game for thresholdMinutes+. */
        long_session: {
            enabled: true,
            cooldownMinutes: 360,
            thresholdMinutes: 180,
        },

        /** React when minPlayers+ guild members are playing the same game. */
        group_gaming: {
            enabled: true,
            cooldownMinutes: 240,
            minPlayers: 3,
        },

        /** React when a user starts streaming (activity type 1). */
        streaming: {
            enabled: true,
            cooldownMinutes: 60,
        },

        /** Greet a user who comes online after absenceMinutes+ of being offline. */
        comeback: {
            enabled: true,
            cooldownMinutes: 1440,
            absenceMinutes: 1440,
        },
    },
};
