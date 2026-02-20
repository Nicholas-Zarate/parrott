---
name: Voice listening — rolling buffer, events, keyword trigger, and TTS space
overview: Plan for extending the voice session with (1) rolling 5s buffer + transcribe/compress/save + job-driven quick comments on voiceChatEvents; (2) "parrott" / "sir parrott" keyword trigger using the speaker's following words as input. Includes breaking-change review and abstraction of all TTS/voice-listening behavior into a dedicated TTS space.
extends:
  - voice_session_and_listening_7f0e88a3.plan.md
  - voice_listening_rolling_buffer_and_triggers.plan.md
todos: []
isProject: false
---

# Voice listening: rolling buffer, event-driven comments, keyword trigger, and TTS abstraction

This plan consolidates the feature updates for when the parrot triggers while listening in voice chat, reviews breaking changes, and defines how to keep this behavior in its own TTS space.

---

## 1. Feature summary

| # | Feature | Description |
|---|--------|--------------|
| 1 | **Rolling 5s buffer** | Parrot keeps the last 5 seconds of voice per session: transcribe → compress → save. |
| 2 | **voiceChatEvents + job** | A job runs to detect events in the compressed text and produce a quick comment (TTS or text). **v1 event**: someone got shot, dead, downed, killed, blown up, or is calling for medic/defib. |
| 3 | **Keyword trigger** | When someone says "parrott" or "sir parrott", the parrot uses that speaker's **following words** (same utterance or next utterance) as the direct input to the LLM/tools. |

---

## 2. Rolling 5s buffer and event-driven quick comments

### 2.1 Behavior

- While **listening**, maintain a **rolling 5-second window** of received voice per session.
- For each window: **transcribe** (STT), **compress** (summarise or key phrases), **save** (in-memory per session for v1; optional DB later).
- A **job** runs on an interval (e.g. every 10–15s) or when new compressed text is available. It checks the last window against **voiceChatEvents**. On match, it generates a short comment and plays it in session (or posts to text channel). Enforce a **cooldown** (e.g. 30–60s) per session to avoid spam.

### 2.2 voiceChatEvents (v1)

- **Single event**: *"Someone got shot, dead, downed, killed, blown up, or is calling for a medic or a defib."*
- Implement as a **configurable array** (e.g. `agent/abilities/voice/voice-chat-events.js` or config) so more events can be added later.
- **Detection**: keyword/regex for v1 (e.g. "medic", "defib", "I'm down", "got shot", "killed", "blown up"). Optional: LLM pass later.

### 2.3 Components

| Component | Responsibility |
|-----------|----------------|
| **Rolling buffer** | In pipeline (or dedicated buffer module in TTS space), accumulate last 5s of audio per session; trim then pass to transcribe. |
| **Compress** | After STT on the window, compress transcript (summarise or keep verbatim if short). Store where the job can read it. |
| **Save** | Persist compressed transcript per session (in-memory v1: e.g. `session.lastCompressedWindow = { text, ts }`). |
| **Job** | e.g. `voice-quick-comment-job.js`: for each active session with a recent window, run event detection; if match and cooldown OK, LLM → short line → playInSession (or post to channel). |
| **voiceChatEvents** | Array of event descriptors; v1: one entry with keywords/regex for shot/dead/downed/killed/blown up/medic/defib. |

---

## 3. Keyword trigger: "parrott" / "sir parrott"

### 3.1 Behavior

- When STT yields text containing **"parrott"** or **"sir parrott"**, treat as **direct invocation** from that speaker.
- Use the **following words** as user input:
  - **Same utterance**: e.g. "Sir parrott what's the weather" → input = "what's the weather".
  - **Next utterance**: If keyword is alone or at end, set `expectDirectInputFromUserId = userId` and use the **next** utterance from that user as input.

### 3.2 Pipeline changes

- After STT produces `userText`, check trigger: `/\b(?:sir\s+)?parrott\b/i`.
- If matched:
  - Strip trigger and normalize; if non-empty remainder → use as `userMessage` and run LLM/tools.
  - If no remainder → set per-session `expectDirectInputFromUserId = userId`; on next `onStart(userId)` use that utterance as direct input and clear the flag.
- Only the **speaker** who said the keyword is used for "following words"; ignore others until timeout (e.g. 15s) or next utterance from invoker.

---

## 4. Breaking-change review

| Area | Risk | Mitigation |
|------|------|------------|
| **Pipeline contract** | Adding rolling buffer + keyword logic can change when `onStart` runs or what counts as a "turn". | Keep existing utterance→STT→LLM→TTS path as default. Add rolling buffer as a **parallel** path (separate timer/interval or stream), and keyword handling as **preprocessing** on the same path so existing behavior stays unless trigger/flag is set. |
| **Session shape** | New fields (`lastCompressedWindow`, `expectDirectInputFromUserId`, `lastQuickCommentAt`) could break callers that assume a fixed session shape. | Add new fields only to the session object used inside the voice/TTS layer; do not expose them in public API of session manager. Session manager continues to return the same `getSession()` shape for external use; internal pipeline/session can extend it. |
| **Job scheduler** | New job (voice-quick-comment) must be registered; wrong interval or heavy work could affect other jobs. | Run voice-quick-comment at a modest interval (10–15s); make it a no-op when no active sessions. Register in same scheduler as announcement job so startup and lifecycle stay consistent. |
| **STT usage** | Rolling buffer will call STT more often (every 5s window); could hit rate limits or cost. | Throttle: only run STT for the rolling window when the session is listening and buffer is ready; optional cap per session (e.g. max one window per 5s). Reuse existing `transcribeFromFile`; no change to its signature. |
| **DB** | Optional `voice_rolling_windows` table later could require migration. | v1 uses in-memory only; no DB change. If added later, migration is additive (new table); no change to `voice_sessions` or `voice_session_turns`. |
| **Tools / slash commands** | hang_out_in_voice, start_listening, stop_listening already exist. | No change to tool names or slash commands. New behavior is internal to pipeline and job. |
| **Mention handlers** | handlers.js starts the pipeline and uses `playInSession`. | No change to handler entry points. Pipeline and play stay behind `abilities/voice`; handlers keep calling `startPipeline(session, client)` and `playInSession`. |

**Conclusion**: No intentional breaking changes to public API. All new behavior is additive and contained inside the voice/TTS layer.

---

## 5. Abstracting into its own TTS space

### 5.1 Goal

Keep all voice-listening, TTS, rolling-buffer, event-detection, and keyword-trigger logic in one place so that:

- The rest of the agent (mention handlers, tools, commands) depends only on a **small, stable surface** (join, play, session lifecycle, start/stop listening).
- Changes to "how the parrot listens and when it speaks" do not scatter across handlers, tools, and jobs.

### 5.2 Recommended layout: TTS space under `agent/abilities/voice/`

Treat **`agent/abilities/voice/`** as the **TTS space**. All of the following live under it:

| Path | Responsibility |
|------|----------------|
| `session.js` | Session lifecycle (start/end/get/setListening). |
| `pipeline.js` | Receive → STT → [keyword handling] → LLM → TTS; **plus** rolling buffer and compression; calls into voice-chat-events only for event detection when used by the job. |
| `stt.js` | STT (Whisper); used by pipeline and by rolling-window path. |
| `tts.js` | TTS generation. |
| `play.js` | Play in channel / play in session (one-off and in-session). |
| `voice-chat-events.js` **(new)** | `voiceChatEvents` array and `detectEvents(compressedText)` (returns matched event ids). |
| `rolling-buffer.js` **(new)** | Rolling 5s buffer: accept audio chunks, trim to 5s, expose "current window" for pipeline to transcribe/compress and for job to read. |
| (job lives in `agent/jobs/`) | `voice-quick-comment-job.js` **only** imports from `abilities/voice`: getSession, session.lastCompressedWindow, voiceChatEvents.detectEvents, playInSession, and optionally a small `quickCommentFromEvents(session, eventIds)` that uses LLM + TTS. |

**Single entry for the rest of the app**:

- **`agent/abilities/voice/index.js`** (existing): Export only what external code needs:
  - `playSquawkInChannel`, `playInVoiceChannel`, `playInSession`
  - `getSession`, `startSession`, `endSession`, `setListening`
  - `startPipeline`, `stopPipeline` (from pipeline.js) — so that tools/commands can start/stop listening without touching buffer or job internals.

Do **not** export from index: `rolling-buffer`, `voice-chat-events`, or the job. The job is started by the scheduler and imports directly from `abilities/voice/pipeline` or a small `abilities/voice/quick-comment.js` that uses events + LLM + playInSession.

### 5.3 Optional: dedicated `agent/tts/` namespace

If you prefer a clearer namespace than "abilities/voice":

- Create **`agent/tts/`** (or **`agent/voice-tts/`**).
- Move or re-export: session, pipeline, stt, tts, play, voice-chat-events, rolling-buffer.
- Keep **`agent/abilities/voice/`** as a thin wrapper that re-exports from `agent/tts/` for backward compatibility, so existing `require('../voice')` and `require('../voice/pipeline')` still work.

Then the **scheduler** and any new code can `require('../tts/...')` for job-related helpers. This keeps "TTS space" as a single tree and makes it obvious where to add future voice-listening features.

### 5.4 Summary

- **Minimal change**: Keep everything under `agent/abilities/voice/`, add `voice-chat-events.js` and `rolling-buffer.js`, and have the job in `agent/jobs/` depend only on the public session + a small internal helper (e.g. `quickCommentFromEvents`) that lives under `abilities/voice`. No new top-level namespace.
- **Clear TTS namespace**: Optionally introduce `agent/tts/` and have `abilities/voice` re-export from it so that all TTS/voice-listening behavior "lives in" one place and is easy to find and extend.

---

## 6. Implementation order

1. **voiceChatEvents** — Add `agent/abilities/voice/voice-chat-events.js`: array with one event (game_death_medic), `detectEvents(compressedText)`.
2. **Rolling buffer** — Add `agent/abilities/voice/rolling-buffer.js`; integrate into pipeline so that while listening, the last 5s is continuously transcribed, compressed, and stored on the session (e.g. `session.lastCompressedWindow`).
3. **Quick-comment job** — Add `agent/jobs/voice-quick-comment-job.js`; register in scheduler. For each active session with a recent window, run `detectEvents`, cooldown check, then LLM + playInSession (or post to channel).
4. **Keyword trigger** — In pipeline, after STT: detect "parrott" / "sir parrott", extract same-utterance input or set `expectDirectInputFromUserId` and consume next utterance from that user; use that input for the turn.
5. **Tests** — Unit tests for keyword regex, same vs next utterance; manual or integration test for rolling buffer and event-driven comment.

---

## 7. Summary table

| Feature | Description |
|--------|--------------|
| Rolling 5s buffer | Last 5s of voice per session → transcribe → compress → save (in-memory v1). |
| voiceChatEvents | Config array; v1 = one event: shot/dead/downed/killed/blown up/medic/defib. |
| Quick-comment job | Periodic (or on update); detects events in compressed text; short comment; TTS in session or post; cooldown. |
| Keyword trigger | "parrott" / "sir parrott" → use speaker's following words (same or next utterance) as input. |
| Breaking changes | None to public API; additive pipeline and session-internal fields only. |
| TTS space | All behavior under `agent/abilities/voice/` (or optionally `agent/tts/`); single facade in index; job imports only from this space. |
