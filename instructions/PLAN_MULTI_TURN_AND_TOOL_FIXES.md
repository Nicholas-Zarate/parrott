# Plan: Multi-turn context + tool description + recent messages

## Goal
Reduce wrong-tool selection (e.g. "yes" → Popeyes timer instead of agreeing to say "Blessings to you always") by adding proper conversation turns and clarifying tool behavior.

---

## Fix 1: Add real multi-turn context

**Problem:** Each @mention sends only `[system, user]`. The model never sees the previous assistant turn, so "yes" is ambiguous.

**Approach:**
- When the message **immediately above** the current one is from the bot, treat that as the last assistant reply and the message above *that* as the last user message. Send them as proper `user` / `assistant` turns before the current user content.

**Implementation:**

1. **format.js**
   - Add `getPreviousTurnForParrot(message, botUser)`:
     - Fetch 2 messages with `channel.messages.fetch({ limit: 2, before: message.id })` (newest first).
     - If `fetched.size >= 2`: first = message right above current, second = message before that.
     - If `first.author.id === botUser.id` and `second.author.bot === false`: return `{ userContent, assistantContent }` where:
       - `userContent` = `formatMessageForParrot(second, botUser)` (same format as current user).
       - `assistantContent` = `first.content` trimmed, capped (e.g. same MAX_MESSAGE_CONTENT_LENGTH or 800) so we don’t blow context.
     - Otherwise return `null`.
   - Export `getPreviousTurnForParrot`.

2. **handlers.js**
   - After `buildUserContentForParrot(message, client.user)`, call `getPreviousTurnForParrot(message, client.user)`.
   - If result is non-null, set:
     - `messages = [ { role: 'system', content: systemPrompt }, { role: 'user', content: prev.userContent }, { role: 'assistant', content: prev.assistantContent }, { role: 'user', content: fullUserContent } ]`.
   - Else keep current: `messages = [ system, user(fullUserContent) ]`.

**Edge cases:** If the message above is not from the bot (e.g. someone else replied), we don’t add a previous turn. No change to Supabase or reply logic.

---

## Fix 2: Clarify join_voice_and_squawk tool description

**Problem:** The tool text doesn’t say that "yes" after offering an alternative phrase should call the tool with that phrase.

**Implementation:**
- In **ai-sdk/with-tools.js**, in the `join_voice_and_squawk` tool `description`, append:
  - `" If you previously offered an alternative phrase (e.g. a neutral version) and the user agrees (e.g. says 'yes'), call this tool with that phrase in customMessage."`

---

## Fix 3: Slightly increase recent messages

**Goal:** More context in the "Recent messages above" block so the say/neutral-version exchange is less likely truncated.

**Implementation:**
- In **mention/format.js**:
  - `RECENT_MESSAGES_ABOVE_LIMIT`: 5 → 8
  - `RECENT_MESSAGES_ABOVE_MAX_CHARS`: 1500 → 2000
- In `getRecentMessagesAboveForParrot`, the fetch uses `Math.min(limit, 10)`, so with limit 8 we already fetch up to 8; no change needed there.

---

## Review checklist (after implementation)
- [ ] No duplicate or conflicting logic between previous-turn content and "Recent messages above".
- [ ] Previous turn only used when the message right above is the bot (no wrong user/assistant pairing).
- [ ] Assistant content length-capped to avoid context overflow.
- [ ] join_voice_and_squawk description is still readable and doesn’t break existing behavior.
- [ ] Constants in format.js updated and used consistently.
