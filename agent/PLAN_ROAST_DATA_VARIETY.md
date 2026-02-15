# Plan: Richer data for /roast command

## Goal
Collect a broader variety of Discord data about the target user so the LLM has more context for roasts (names, roles, behavior, presence, message style). All data must be obtainable from the Discord.js API with the bot’s current intents and permissions.

---

## What we already send
- **User:** tag, userId
- **Messages:** channel name, timestamp, plain text content (truncated)
- **Activity:** activity name, type number, state (from presence)

---

## Additional data we can add (with source and effort)

### 1. User & member profile (low effort)
| Data | Source | Notes |
|------|--------|--------|
| **Global display name** | `User.globalName` | Different from username; good for roasts |
| **Server nickname** | `GuildMember.nickname` | From `guild.members.fetch(targetUserId)` |
| **Display name** | `GuildMember.displayName` | Nickname or global name |
| **Account age** | `User.createdAt` | When the Discord account was created |
| **Server join date** | `GuildMember.joinedAt` | When they joined this server |
| **Is bot** | `User.bot` | So the model can roast bots differently |

**Implementation:** In `roast/collect.js`, after we have `targetUserId`, call `guild.members.fetch(targetUserId).catch(() => null)`. From the resolved `User` (from interaction or `member.user`) we have `globalName`, `createdAt`, `bot`. From `GuildMember` we have `nickname`, `displayName`, `joinedAt`. Format as a short “PROFILE” block (e.g. “Display name: X, Nickname: Y, Joined server: date, Account created: date, Bot: yes/no”).

---

### 2. Roles (low effort)
| Data | Source | Notes |
|------|--------|--------|
| **Role names** | `GuildMember.roles.cache` (exclude @everyone) | Gives context (Admin, Mod, “Minecraft”, etc.) |

**Implementation:** From the same `GuildMember` above, `member.roles.cache.filter(r => r.id !== guild.id).map(r => r.name)` (avoid @everyone). Add a line like “Roles: RoleA, RoleB” or “Roles: none”. Keeps role names only (no IDs) to save tokens.

---

### 3. Richer presence (low effort)
| Data | Source | Notes |
|------|--------|--------|
| **Status** | `Presence.status` | online, idle, dnd, offline |
| **Client status** | `Presence.clientStatus` | desktop, web, mobile (which devices) |
| **Activity type label** | Map `Activity.type` 0–5 → Playing / Streaming / Listening / Watching / Custom / Competing | More readable than a number |

**Implementation:** In the analysis collector we already have `userActivities`; we can also pass back a small “presence” object per user (status + clientStatus). In roast collect, when building activities, map type to string (e.g. “Playing”, “Listening to”) and add one line for status (e.g. “Status: online (desktop, mobile)”). Optional: in `collectGuildData` or in roast collect, read `member.presence.status` and `member.presence.clientStatus` for the target user and add to the payload.

---

### 4. Per-message context (medium effort)
| Data | Source | Notes |
|------|--------|--------|
| **Reply** | `Message.reference` | “Reply to message in #channel” or “Reply to @user” (we can try to resolve or leave as “reply”) |
| **Attachments** | `Message.attachments.size`, optionally first attachment type/name | “2 attachments” or “image, file.pdf” |
| **Stickers** | `Message.stickers` (names) | “Sticker: name” |
| **Reactions received** | `Message.reactions.cache` → emoji + count | “Got 👍×3, 😂×1” |

**Implementation:** When iterating messages in `roast/collect.js`, for each message add optional fields: `isReply: !!msg.reference`, `attachmentCount: msg.attachments.size`, `attachmentSummary` (e.g. first few types/names), `stickerNames: msg.stickers.map(s => s.name)`, `reactions: Array.from(msg.reactions.cache, r => ({ emoji: r.emoji.name || r.emoji.identifier, count: r.count }))`. In `format.js`, optionally append a short line per message like “(reply, 1 attachment, reactions: 👍×3)” so we don’t blow the token budget. Cap total message-context length (e.g. one short suffix per message, or only for first N messages).

---

### 5. Aggregated message stats (low–medium effort)
| Data | Derivation | Notes |
|------|------------|--------|
| **Message count** | Already have messages.length | “Sent 47 messages in window” |
| **Average message length** | Sum content lengths / count | “Short one-liners” vs “essays” |
| **Emoji usage** | Regex on message content for unicode + `<:name:id>` | “Top emojis: 😂, :pepe:, 👍” |
| **Link/URL count** | Regex for URLs in content | “Shares many links” |
| **Reply ratio** | Count messages with `reference` / total | “Usually replies” vs “starts threads” |

**Implementation:** In collect or format, compute from the messages array we already have. Add a “STATS” or “BEHAVIOR” block: message count, avg length, top 3–5 emojis, link count, reply ratio. All from existing data, no extra API calls.

---

### 6. Channel / server context (low effort)
| Data | Source | Notes |
|------|--------|--------|
| **Guild name** | `guild.name` | “Server: Cool Kids” |
| **Channels they posted in** | From existing message list | “Posted in: #general, #memes, #off-topic” |

**Implementation:** Pass `guild.name` into the formatter. Derive channel list from messages (unique channel names). Add one line “Server: X” and “Channels: #a, #b, #c” so the model can reference the server.

---

## What we should avoid or treat carefully
- **Banner / avatar URL:** Requires optional `User.fetch()` and can fail; not critical for roasts. Skip or add later as optional.
- **Full reply message content:** Would require `message.fetchReference()` per reply and extra API calls; use “is reply” and maybe “reply to @User” if we have reference without fetch.
- **Very long role lists:** Cap to e.g. 10 role names.
- **Token budget:** We already have `MAX_USER_DATA_CHARS`. Adding sections (PROFILE, ROLES, STATS, PRESENCE, BEHAVIOR) should stay within that cap; prefer short one-line summaries and caps (e.g. “Top emojis: 5 max”, “Roles: 10 max”).

---

## Suggested format order (for the LLM block)
1. **USER & PROFILE** – tag, globalName, displayName, nickname, account age, server join, bot, server name  
2. **ROLES** – comma-separated role names (or “none”)  
3. **PRESENCE** – status, devices, activities with type labels (Playing X, Listening to Y)  
4. **BEHAVIOR / STATS** – message count, avg length, top emojis, link count, reply ratio, channels posted in  
5. **MESSAGES** – unchanged but optionally with small per-message context (reply, attachments, reactions)  
6. **ACTIVITY** – keep current activity list if not merged into PRESENCE  

This order gives identity and context first, then behavior, then raw messages.

---

## Implementation order (phased)

**Phase 1 – Profile & roles & server (no new API surface)**  
- In `collect.js`: `guild.members.fetch(targetUserId)`; build `profile: { globalName, nickname, displayName, accountCreatedAt, joinedAt, bot, guildName }` and `roleNames: string[]`.  
- In `format.js`: Add PROFILE and ROLES and “Server: X” before MESSAGES; stay under `MAX_USER_DATA_CHARS`.

**Phase 2 – Presence enrichment**  
- In analysis collector or roast collect: for target user only, add `status`, `clientStatus`, and activity type labels (0→Playing, 1→Streaming, etc.) into the payload.  
- In `format.js`: Add PRESENCE block (status, devices, “Playing X”, “Listening to Y”, etc.).

**Phase 3 – Message context**  
- In `collect.js`: For each message add `isReply`, `attachmentCount`, `reactions` (emoji + count).  
- In `format.js`: Optionally append a short “(reply, 2 attachments, 👍×3)” per message or for first N messages; cap length.

**Phase 4 – Aggregated stats**  
- In `collect.js` or a small `roast/stats.js`: From messages compute messageCount, avgLength, topEmojis (regex), linkCount, replyCount.  
- In `format.js`: Add BEHAVIOR/STATS block (one line each or a short list).

---

## Config / constants
- In `config/roast.js` (or constants): optional caps, e.g. `MAX_ROLE_NAMES: 10`, `MAX_EMOJI_TOP: 5`, `MAX_MESSAGE_CONTEXT_LENGTH: 50` (per-message suffix).  
- Keep `MAX_USER_DATA_CHARS`; if we exceed after adding sections, truncate MESSAGES first (we already truncate there) or shorten STATS/PROFILE to one line each.

---

## Summary table

| Data category     | New API calls?      | Effort  | Roast value |
|-------------------|--------------------|---------|-------------|
| Profile & member  | 1 fetch (member)   | Low     | High (names, join date, bot) |
| Roles             | No (from member)   | Low     | High (context) |
| Presence labels   | No                 | Low     | Medium (Playing vs Listening) |
| Status & devices  | No                 | Low     | Medium (online, desktop) |
| Per-msg context   | No                 | Medium  | Medium (replies, reactions) |
| Aggregated stats  | No                 | Low–Med | High (personality) |
| Server/channels   | No                 | Low     | Medium (context) |

All of this fits within existing intents (Guilds, GuildMembers, GuildPresences) and the same message-fetch pattern we already use. No new intents or permissions required.
