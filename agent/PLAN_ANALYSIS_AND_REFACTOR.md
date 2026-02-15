# Plan: Analysis feature + code refactor

## 1. Code organization (abstract into separate files)

### Current state
- Single file `discord-voting-bot.js` (~588 lines): client, constants, all poll logic, handlers, login.

### Proposed layout

```
agent/
  discord-voting-bot.js   # Entry: create client, wire modules, login
  config/
    constants.js           # THEME, POLL_TYPES, HEARING, (later ANALYSIS defaults)
  poll/
    store.js               # activePolls Map + any poll state
    commands.js            # SlashCommandBuilder definitions (vote, endpoll, pollresults, vote_hearing)
    create.js              # createPoll, createHearingPoll, createPollFromParams, createHearingPollMessage, buildHearingRows
    votes.js               # calculateVotes, updatePollEmbed, getPollDescription
    handlers.js            # handleCommand (poll), handleButton (poll), handleModalSubmit (hearing)
    results.js             # showResultsButton, endPollButton, endPoll, endPollAuto, finalizeResults, showResults
  analysis/
    types.js               # JSDoc (or .d.ts) for analysis objects
    collector.js           # Fetch messages + presence; build raw stats
    report.js              # Build full vs minimal report objects from raw stats
  commands.js            # SlashCommandBuilder for /analysis and /analysis_mini
  handlers.js            # handle analysis commands → collector → report → reply
  lib/
    theme.js               # Optional: THEME + shared embed styling helpers if reused by analysis
```

- **Entry** stays thin: require config, poll handlers, analysis handlers; register commands from both; `interactionCreate` delegates to poll or analysis.
- **Poll code** moves into `poll/` (store, commands, create, votes, handlers, results). `discord-voting-bot.js` or a small `poll/index.js` can re-export a single `registerPollCommands` and `handlePollInteraction` so the main file stays simple.
- **Analysis** is self-contained under `analysis/`: types, data collection, report building, commands, handlers.
- **Type definitions** live in `analysis/types.js` (JSDoc) so we have one place for “analysis objects and time range” (see below).

---

## 2. Analysis: objects and time range

### Time range
- **Primary:** “Last N **days**” (e.g. 1, 7, 30). Default: **7 days**.
- **Optional:** “Last N **messages**” per channel (cap, e.g. 500) for channels we analyze, so we don’t pull unlimited history.
- **Scope:** Current guild only. Option: “this channel” vs “all channels I can read” (with a cap per channel to avoid rate limits).

Suggested options for both analysis commands:
- `scope`: choice `channel` | `server` (default `channel`).
- `days`: integer 1–90 (default 7). We consider messages after `now - days * 24 * 60 * 60 * 1000`.
- Optional: `max_messages_per_channel`: integer (default 500) to cap fetches.

So “time range” is defined as: **from (now - days) to now**, and we only consider messages in that window; optionally we also cap by `max_messages_per_channel` when fetching.

### Objects we analyze
- **Messages** (from channel history, with MESSAGE_CONTENT intent if we want content stats):
  - Per channel: message count, unique authors.
  - Per user: message count, (optional) total character/word count.
  - Globals: total messages, total unique users, messages per day (average).
- **Activity / games** (from presence, if GUILD_PRESENCES + GUILD_MEMBERS enabled):
  - Per user: list of “activities” seen (name, type: Playing/Streaming/Listening/etc.).
  - Aggregate: “games/apps seen” (e.g. count of users seen playing X).

### Type definitions (JSDoc in `analysis/types.js`)

We define the **report shapes** and **time range** so both “full” and “minimal” commands return typed data.

```javascript
/**
 * @typedef {Object} TimeRangeOptions
 * @property {number} days - Number of days to look back (1–90).
 * @property {number} [maxMessagesPerChannel=500] - Cap messages fetched per channel.
 */

/**
 * @typedef {Object} ChannelStats
 * @property {string} channelId
 * @property {string} channelName
 * @property {number} messageCount
 * @property {number} uniqueAuthors
 */

/**
 * @typedef {Object} UserMessageStats
 * @property {string} userId
 * @property {string} userTag
 * @property {number} messageCount
 * @property {number} [charCount] - Optional, if content intent enabled.
 */

/**
 * @typedef {Object} UserActivityInfo
 * @property {string} name - Activity name (e.g. game/app name).
 * @property {number} type - ActivityType (Playing, Streaming, etc.).
 * @property {string} [state] - Optional state/detail string.
 */

/**
 * @typedef {Object} AnalysisReport
 * @property {TimeRangeOptions} timeRange
 * @property {string} guildId
 * @property {string} guildName
 * @property {number} totalMessages
 * @property {number} uniqueUsers
 * @property {number} [messagesPerDay]
 * @property {ChannelStats[]} channelStats - Sorted by messageCount desc.
 * @property {UserMessageStats[]} userStats - Sorted by messageCount desc.
 * @property {Object.<string, UserActivityInfo[]>} [userActivities] - userId -> activities (if presence enabled).
 * @property {Object.<string, number>} [activityCounts] - Activity name -> number of users seen (if presence enabled).
 */
```

- **Minimal report** reuses the same types but we only fill a subset of fields (e.g. `totalMessages`, `uniqueUsers`, top 3–5 channels, top 3–5 users, one summary line for activity). We can add:

```javascript
/**
 * @typedef {Object} AnalysisReportMinimal
 * @property {number} totalMessages
 * @property {number} uniqueUsers
 * @property {ChannelStats[]} topChannels - Length 3–5.
 * @property {UserMessageStats[]} topUsers - Length 3–5.
 * @property {string} [activitySummary] - One-line summary of games/activity (if presence enabled).
 * @property {string} timeRangeSummary - e.g. "Last 7 days"
 */
```

So:
- **Objects:** `TimeRangeOptions`, `ChannelStats`, `UserMessageStats`, `UserActivityInfo`, `AnalysisReport` (full), `AnalysisReportMinimal`.
- **Time range:** `days` (and optional `maxMessagesPerChannel`), applied as “from (now - days) to now” when fetching messages.

---

## 3. Two commands: full detail vs minimal

### Command 1: Full detail
- **Name:** `/analysis` (or `/analyze`).
- **Options:**
  - `scope`: choice `channel` | `server` (default `channel`).
  - `days`: integer 1–90 (default 7).
  - Optional: `max_messages`: integer (default 500) per channel when scope is server.
- **Behavior:**
  - Resolve time range from `days` (and optionally cap by `max_messages` per channel).
  - Run collector (messages in range; presence snapshot for current members if intents on).
  - Build full `AnalysisReport`: all channel stats, all user message stats, messages per day, and if available user activities + activity counts.
  - Reply: **ephemeral** or in channel (configurable) with a long embed or multiple embeds / code block:
    - Time range + guild/channel scope.
    - Table or list of channels (name, message count, unique authors).
    - Table or list of users (tag, message count, optional char count).
    - Optional: “Games/activity seen” (activity counts or top activities).
- **Output:** Structured so it matches `AnalysisReport` (we can later add export or JSON if needed).

### Command 2: Minimal
- **Name:** `/analysis_mini`.
- **Options:**
  - `scope`: choice `channel` | `server` (default `channel`).
  - `days`: integer 1–90 (default 7).
- **Behavior:**
  - Same time range and collector as full, but we only build a **minimal** report: totals + top 3–5 channels + top 3–5 users + one-line activity summary.
  - Reply: **single short embed** or a few lines of text: “Last 7 days: X messages, Y users. Top channels: #a (n1), #b (n2), #c (n3). Top users: @u1 (m1), @u2 (m2). Activity: …”
- **Output:** Matches `AnalysisReportMinimal`.

### Shared behavior
- Both commands need the bot to have **read message history** (and, for full content stats, **Message Content** intent).
- For activity/games: **Guild Presences** (and usually **Guild Members**) intents; if not enabled, we simply omit activity from reports.
- Permissions: require “View Channel” (and “Read Message History”) for the channel(s) we analyze; optionally restrict to users with “Manage Server” or a specific role to avoid abuse.

---

## 4. Implementation order (suggested)

1. **Refactor first (no new features)**  
   - Add `config/constants.js`, `poll/store.js`, `poll/commands.js`, `poll/create.js`, `poll/votes.js`, `poll/handlers.js`, `poll/results.js`.  
   - Move code from `discord-voting-bot.js` into these modules; entry only wires and runs the bot.  
   - Confirm all existing poll commands and hearing flow still work.

2. **Analysis types and collector**  
   - Add `analysis/types.js` with JSDoc types above.  
   - Add `analysis/collector.js`: time range from options, fetch messages in range (per channel, with cap), optionally gather presence for guild members; output raw structures that `report.js` can consume.

3. **Reports**  
   - Add `analysis/report.js`: functions `buildFullReport(raw, timeRange, guild)` → `AnalysisReport`, and `buildMinimalReport(raw, timeRange, guild)` → `AnalysisReportMinimal`.

4. **Analysis commands and handlers**  
   - Add `analysis/commands.js`: register `/analysis` and `/analysis_mini` with the options above.  
   - Add `analysis/handlers.js`: handle both commands → run collector → build report (full or minimal) → format and reply (embed or text).  
   - Wire in entry: register analysis commands and route interaction to analysis handlers when command is `analysis` or `analysis_mini`.

5. **Intents and permissions**  
   - Enable **GuildMembers** and **GuildPresences** if we want activity; **Message Content** if we want content-based stats.  
   - Document in README or INSTRUCTIONS which intents are required for which parts of analysis.

---

## 5. Review summary

| Item | Decision |
|------|----------|
| **Code split** | Poll logic in `poll/*`; analysis in `analysis/*`; shared config in `config/`; entry stays thin. |
| **Time range** | Defined by `days` (1–90, default 7) and optional `max_messages_per_channel`; “from (now - days) to now”. |
| **Objects** | `TimeRangeOptions`, `ChannelStats`, `UserMessageStats`, `UserActivityInfo`, `AnalysisReport`, `AnalysisReportMinimal` in `analysis/types.js` (JSDoc). |
| **Full command** | `/analysis`: full report (all channels, all users, activity if intents on); options: scope, days, optional max_messages. |
| **Minimal command** | `/analysis_mini`: one short summary (totals, top 3–5 channels/users, one-line activity); options: scope, days. |
| **Type definitions** | JSDoc in `analysis/types.js`; no separate TypeScript unless we add .ts later. |

This keeps the codebase organized, gives clear analysis objects and a single time-range definition, and delivers two distinct commands (full vs minimal) that share the same data collection and types.
