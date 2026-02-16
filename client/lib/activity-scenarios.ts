/**
 * Activity trigger scenario definitions for the Scenarios page.
 * Descriptions and config summaries match agent/config/activity.js and agent/activity/triggers.js.
 */

export type ScenarioConfig = {
  /** Short human description of when this fires */
  description: string;
  /** Optional config summary (e.g. "Cooldown: 90 min") */
  configSummary?: string;
  /** Source: presence = presenceUpdate, voice = voiceStateUpdate */
  source: "presence" | "voice";
};

export const ACTIVITY_SCENARIOS: Record<string, ScenarioConfig> = {
  game_start: {
    description: "Someone starts playing a game (Discord “Playing” activity appears).",
    configSummary: "Cooldown: 90 min per user",
    source: "presence",
  },
  late_night: {
    description: "Someone starts a game during the late-night window (e.g. 00:00–05:00 UTC).",
    configSummary: "Cooldown: 6h · Window: 0:00–5:00 UTC",
    source: "presence",
  },
  long_session: {
    description: "Someone has been playing the same game for longer than the threshold (e.g. 3+ hours).",
    configSummary: "Cooldown: 6h · Threshold: 180 min",
    source: "presence",
  },
  group_gaming: {
    description: "At least N members are playing the same game; fires when a new person joins that group.",
    configSummary: "Cooldown: 4h · Min players: 3",
    source: "presence",
  },
  streaming: {
    description: "Someone starts a Discord “Streaming” activity (game stream status).",
    configSummary: "Cooldown: 60 min",
    source: "presence",
  },
  go_live: {
    description: "Someone starts Go Live (screen share) in a voice channel.",
    configSummary: "Cooldown: 60 min",
    source: "voice",
  },
  comeback: {
    description: "Someone comes online after being offline for longer than the absence threshold (e.g. 24h).",
    configSummary: "Cooldown: 24h · Absence: 1440 min",
    source: "presence",
  },
};

/** Order to display scenarios on the page */
export const SCENARIO_ORDER: string[] = [
  "game_start",
  "late_night",
  "long_session",
  "group_gaming",
  "streaming",
  "go_live",
  "comeback",
];

export const ELI5_STEPS = [
  {
    title: "Discord sends events",
    body: "When someone starts a game, goes live in voice, or comes back online, Discord sends presence or voice state updates to the bot.",
  },
  {
    title: "Listener receives them",
    body: "The activity listener subscribes to these events. It ignores bots and only runs when the event is for a real user in a server the bot is in.",
  },
  {
    title: "Triggers decide “does this match?”",
    body: "Each scenario (game start, late night, long session, etc.) has a small detector. They run on the event and say “yes, fire” or “no.” If multiple match, we may dedupe (e.g. late night overrides game start for the same game).",
  },
  {
    title: "Cooldown prevents spam",
    body: "Before doing anything, we check: “Have we already reacted to this user for this scenario recently?” If yes, we skip. Each scenario has its own cooldown (e.g. 90 min for game start, 24h for comeback).",
  },
  {
    title: "Delivery: channel, DM, voice",
    body: "If we passed cooldown, we send the message: to the activity channel, optionally DM the user, and optionally join their voice channel and TTS the message if they’re in VC.",
  },
] as const;
