# Plan: /roast command (user data → OpenAI → roast)

## Goal
A slash command that selects a user, gathers their recent messages and activity, formats that data for an LLM, sends it to OpenAI with a configurable prompt to generate a roast, and posts the result in the channel.

---

## Security (critical)

**Do not store the OpenAI API key in code or in any file committed to git.**

- Use an **environment variable** (e.g. `OPENAI_API_KEY`) for the key.
- Load it at runtime: `process.env.OPENAI_API_KEY`.
- Add `.env` to `agent/.gitignore` and document that users create a `.env` file with `OPENAI_API_KEY=sk-...` locally (never commit `.env`).
- If the key is missing, the command should reply with a clear error (e.g. "OpenAI API key not configured.") and not call the API.

---

## 1. Command design

**Name:** `roast`

**Options:**
| Option   | Type    | Required | Description |
|----------|---------|----------|-------------|
| `user`   | User    | Yes      | The server member to roast. |
| `days`   | Integer | No       | Days of history to use (default: 7, min: 1, max: 90). |
| `scope`  | String  | No       | `channel` (current channel only) or `server` (all channels). Default: `channel`. |

**Behavior:**
- Defer reply (roast can take a few seconds).
- Resolve guild (reuse `resolveGuild` pattern from analysis).
- If no API key: `editReply` with "OpenAI API key not configured. Set OPENAI_API_KEY in your environment or .env."
- Collect target user's messages and activity (see §2).
- If no messages found: `editReply` with "No messages found for that user in the selected scope and time range."
- Format data for LLM (see §3).
- Load prompt template (see §5), inject formatted data, call OpenAI (see §4).
- On success: `editReply` with the model's text (roast) in the channel (non-ephemeral so the server can see it).
- On API error: `editReply` with a short error message and log details.

---

## 2. Data collection (target user only)

**Reuse analysis collector, then filter by user.**

- Reuse `collectGuildData(guild, { days, scope, channelId, maxMessagesPerChannel })` from `analysis/collector.js` (or call the same logic). Use `scope` and current `channelId` when scope is channel.
- From the returned `channelMessages` (Map of channelId → Message[]), keep only messages where `msg.author.id === targetUser.id`.
- From `userActivities`, keep only the target user's entry: `userActivities.get(targetUser.id)` (array of `{ name, type, state }`).
- **Output:**
  - `messages`: array of `{ channelName, content, createdAt }` (or similar) for the target user only, sorted by time (oldest first or newest first—pick one and document). Prefer a stable, readable format.
  - `activities`: array of activity objects for that user (games, custom status, etc.).

**Edge cases:**
- Target user is a bot: allow or reject? Plan: allow (let the roast be about a bot).
- No messages: return early with a friendly message (see §1).
- Rate limits: we're doing one user's history; same fetch pattern as analysis. Optionally cap total messages per channel or globally (e.g. last 200 messages for this user across channels) to keep payload size and cost bounded.

---

## 3. LLM-ingestible format

**Goal:** One text blob that describes the user and their behavior so the model can roast them.

**Suggested format (plain text):**

```
USER: <username>#<discriminator> (ID: <id>)

MESSAGES (last N days, scope: channel|server):
[#channel-name] YYYY-MM-DD HH:mm — <message content>
[#channel-name] YYYY-MM-DD HH:mm — <message content>
...

ACTIVITY (games/presence):
- <activity name> (type: X) [state: ...]
- ...
```

- Truncate each message content to a reasonable length (e.g. 200 chars) so we don't blow context.
- Cap total character count for the "user data" block (e.g. 6000–8000 chars) so prompt + data + response fit in the model context (e.g. 128k for gpt-4o-mini); leave room for system/user prompt and response.
- If the user has no activity, write "ACTIVITY: none" or omit the section.

This string is the **user data payload** we will inject into the configurable prompt.

---

## 4. OpenAI integration

**API:** Chat Completions (e.g. `POST https://api.openai.com/v1/chat/completions`).

**Options:**
- Use **native `fetch`** (Node 18+) and no extra dependency, or add **`openai`** npm package for clearer code and error handling. Plan recommends **`openai`** for maintainability.

**Request:**
- **model:** e.g. `gpt-4o-mini` (cheap, good for roasts). Make this configurable (constant or config file).
- **messages:**
  - `role: 'system'`, `content: <system prompt from config>` (e.g. "You are a witty roaster. Keep roasts short and funny, no harassment.")
  - `role: 'user'`, `content: <prompt template with {{USER_DATA}} replaced by the formatted string from §3>`
- **max_tokens:** e.g. 300 (short roast).

**Response:** `choices[0].message.content` → send to Discord.

**Errors:**
- 401: invalid/missing API key → tell user to check OPENAI_API_KEY.
- 429: rate limit → "OpenAI rate limit; try again in a moment."
- 5xx / network error → "OpenAI request failed; try again later."
- Log full error server-side for debugging.

---

## 5. Configurable prompt (future-proof)

**Goal:** You can change the prompt and add context without touching handler logic.

**Approach: config file + template placeholders.**

**New file:** `agent/config/roast.js` (or `agent/roast/config.js` if we put roast in its own module).

**Contents (concept):**

```js
module.exports = {
  // Model and token cap
  model: 'gpt-4o-mini',
  max_tokens: 300,

  // System message (behavior / tone)
  systemPrompt: 'You are a witty roaster. Write a short, funny roast based on the user\'s messages and activity. Keep it light and avoid real harassment.',

  // User message: {{USER_DATA}} is replaced by the formatted user block from §3.
  userPromptTemplate: `Based on the following Discord user and their recent messages and activity, write a short roast (2–4 sentences). Be funny and specific to their messages or activity when possible.

{{USER_DATA}}`,
};
```

**In code:**
- Require this config in the roast handler.
- Build the user message with: `userPromptTemplate.replace('{{USER_DATA}}', formattedUserData)`.
- If you later add more placeholders (e.g. `{{GUILD_NAME}}`, `{{DAYS}}`), replace them in the same way.

**Optional:** Support multiple templates (e.g. "roast" vs "compliment") via a command option or a second command later; for this plan, a single roast template is enough.

---

## 6. Module layout

**Option A – Roast as its own module (recommended):**
- `agent/roast/`
  - `commands.js` – slash command definition for `roast`.
  - `collect.js` – given guild + options + targetUserId, return { messages, activities } for that user (calls analysis collector then filters).
  - `format.js` – turn { messages, activities } + user tag into the LLM text format (§3), with length/truncation caps.
  - `openai.js` – one function: `requestRoast(userDataText, config)` → calls OpenAI, returns `{ content }` or throws.
  - `handlers.js` – `handleRoast(interaction, client)`: defer, resolve guild, get options, collect, format, load config, call openai, editReply.
  - `index.js` – export `getRoastCommands`, `handleRoast`, `isRoastCommand` (if needed for routing).
- `agent/config/roast.js` – prompt template and model settings (§5).
- `agent/discord-voting-bot.js` – register roast command; in `interactionCreate`, if commandName === `roast` then `roast.handleRoast(interaction, client)`.

**Option B – Roast inside analysis:**
- Add roast command and handler under `analysis/`, and add `roast/config.js` and a small `roast/openai.js` helper. Fewer files but mixes “analysis” with “LLM roast”; Option A is cleaner.

**Recommendation:** Option A (dedicated `roast/` module).

---

## 7. Constants and env

- **Env:** `OPENAI_API_KEY` (required for roast to run).
- **Config file:** `config/roast.js` with `model`, `max_tokens`, `systemPrompt`, `userPromptTemplate` (with `{{USER_DATA}}`).
- **Caps (in config or constants):** e.g. `MAX_USER_DATA_CHARS: 7000`, `MAX_MESSAGE_LENGTH: 200`, `DEFAULT_DAYS: 7`, `MAX_DAYS: 90` (reuse ANALYSIS limits if desired).

---

## 8. Implementation order

1. **Config and security**
   - Add `.env` to `agent/.gitignore`.
   - Create `config/roast.js` with placeholders and `{{USER_DATA}}`.
   - Document in README or INSTRUCTIONS: set `OPENAI_API_KEY` in `.env` for `/roast`.

2. **Data collection**
   - Create `roast/collect.js`: use analysis collector, filter messages by target user, get that user’s activities; return structured object.

3. **Formatting**
   - Create `roast/format.js`: build the LLM text block from collect output, apply character/message caps and truncation.

4. **OpenAI**
   - Create `roast/openai.js`: read config and `process.env.OPENAI_API_KEY`, implement `requestRoast(userDataText)` (replace `{{USER_DATA}}`, call Chat Completions, return content). Handle errors and map to user-facing messages.

5. **Command and handler**
   - Create `roast/commands.js` (slash command with user, days, scope).
   - Create `roast/handlers.js` (handleRoast: defer, resolve guild, collect, format, requestRoast, editReply).
   - Create `roast/index.js` (export commands + handler).
   - In `discord-voting-bot.js`: register roast command; on `roast` command, call `roast.handleRoast(interaction, client)`.

6. **Testing and tweaks**
   - Test with a user who has messages; test with no messages; test with missing API key; test with invalid key. Adjust prompt in `config/roast.js` as needed.

---

## 9. Review summary

| Item | Decision |
|------|----------|
| API key | Env var only; never in code or committed files. |
| Command | `/roast user:<required> days:<optional> scope:<optional>`. |
| Data | Reuse analysis collector; filter by target user; add activities for that user. |
| Format | Plain text block (USER, MESSAGES, ACTIVITY) with length caps. |
| Prompt | Config file with `systemPrompt` and `userPromptTemplate` and `{{USER_DATA}}` for future context. |
| Module | New `roast/` module + `config/roast.js`. |
| Errors | No key, no messages, API errors → clear replies and server-side logs. |

This plan gives you a single, configurable roast flow and a clear place to extend prompts or add more LLM commands later.
