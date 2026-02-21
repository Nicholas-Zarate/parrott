---
name: Voice listening — rolling buffer, events, and keyword trigger
overview: Extend the voice session so the parrot (1) keeps a rolling 5-second voice buffer (transcribe, compress, save) and runs a job to produce quick comments when defined voiceChatEvents occur; (2) triggers on "parrott" / "sir parrott" and uses the speaker's following words as direct input.
extends: voice_session_and_listening_7f0e88a3.plan.md
todos: []
isProject: false
---

# Voice listening: rolling buffer, event-driven comments, and keyword trigger

This plan extends the existing [Voice session and listening](voice_session_and_listening_7f0e88a3.plan.md) feature. Implement after the base voice session (join, listen, STT → LLM → TTS, session/turns persistence) is in place.

---

## 1. Rolling 5-second buffer and event-driven quick comments

### 1.1 Behavior

- While the parrot is **listening** in a voice session, it continuously maintains a **rolling 5-second window** of received voice.
- For that window: **transcribe** (STT), **compress** (e.g. summarise or keep key phrases), and **save** (persist for the job and optional replay).
- A **job** runs (e.g. on a short interval, or triggered when new compressed text is available) to decide whether any **voiceChatEvents** occurred in the last window. If so, it produces a **quick comment or response** (short TTS or text) and optionally plays it in the session or posts to the text channel.

### 1.2 voiceChatEvents (v1)

- **Single event for now**: *"Someone got shot, dead, downed, killed, blown up, or is calling for a medic or a defib."*
- Implement as a configurable array (e.g. in config or a small module) so more events can be added later.
- **Detection**: The job (or a small classifier) checks the compressed/transcribed text for phrases or keywords that match this event (e.g. "medic", "defib", "I'm down", "got shot", "killed", "blown up", etc.). Matching can be keyword/regex for v1; later, an LLM pass is possible.

### 1.3 Components

| Component | Responsibility |
|-----------|----------------|
| **Rolling buffer** | In the voice pipeline (or a dedicated buffer module), accumulate the last 5 seconds of audio per session. When new audio is received, trim to 5s, then pass to transcribe. |
| **Compress** | After STT, compress the transcript (e.g. summarise to a few lines, or keep verbatim if short). Store in a format the job can read (e.g. a table or a "last window" per session). |
| **Save** | Persist compressed transcript (and optionally session id, timestamp, guild/channel) so the job can run even if decoupled (e.g. every N seconds) or run inline after each 5s window. |
| **Job** | Input: recent compressed windows (e.g. last 5–10s of data per active session). For each session, check voiceChatEvents; if match, call LLM for a short comment, then TTS in session or post to text channel. |
| **voiceChatEvents** | Array of event descriptors; v1: one entry for "shot/dead/downed/killed/blown up/medic/defib". Code maps this to keywords/regex for detection. |

### 1.4 Data and persistence

- **Option A — In-memory + job polling**: Rolling buffer and last "compressed window" per session in memory; a cron job every 10–15s wakes up, reads active sessions’ last window, runs event detection and quick comment. No new table required for v1.
- **Option B — DB table**: e.g. `voice_rolling_windows` (session_id, window_end_ts, compressed_text, raw_transcript optional). Job queries latest row(s) per session and runs event detection. Keeps history for debugging or future "replay" features.
- **Recommendation**: Start with **Option A** for simplicity; add a small `voiceChatEvents` config (array of event names + keyword/regex rules). If you need audit or replay, add Option B later.

### 1.5 Avoiding spam

- **Cooldown**: After the parrot produces a quick comment for an event, enforce a cooldown (e.g. 30–60s) before another event-driven comment in the same session.
- **Rate limit**: Cap quick comments per session per hour if needed.

---

## 2. Keyword trigger: "parrott" / "sir parrott"

### 2.1 Behavior

- When someone in the voice channel says **"parrott"** or **"sir parrott"** (detected from STT text), the parrot treats this as a **direct invocation**.
- The parrot should **specifically listen to the following words** that the same person says after the keyword and use **that** as the user input (instead of treating the next utterance as a generic turn).
- So: *"Sir parrott, what's the weather?"* → after keyword detection, the phrase *"what's the weather?"* (or the next full utterance) is the input to the LLM/tools.

### 2.2 Implementation options

- **Option A — Same utterance**: If STT returns one chunk like "Sir parrott what's the weather", strip the leading "parrott" / "sir parrott" and use the rest ("what's the weather") as the user message.
- **Option B — Next utterance**: If the keyword is detected in one chunk, wait for the **next** speech from the same user and use that entire utterance as the input. (More natural for "Sir parrott" [pause] "What's the weather?")
- **Recommendation**: Support **both**: if the same utterance has content after the keyword, use it; otherwise (keyword only or keyword at end), take the next utterance from that user as the input.

### 2.3 Pipeline changes

- In the voice pipeline, after STT produces `userText`:
  - Check for trigger: `/\b(?:sir\s+)?parrott\b/i` (or normalized "parrott" only).
  - If matched:
    - **Same-utterance payload**: Strip the trigger and any trailing/leading junk; if something remains, use it as `userMessage` and run LLM/tools as usual.
    - **Next-utterance payload**: If nothing meaningful remains, set a per-session flag like `expectDirectInputFromUserId = userId` and skip running the full turn this time; when the **next** `onStart(userId)` fires for the same userId, use that utterance as the direct input and clear the flag.
- Ensure only the **speaker** who said the keyword is used for the "following words" (same userId).

### 2.4 Edge cases

- **Multiple "parrott" in one utterance**: Use the first occurrence and the rest of the utterance as input.
- **"Parrott" only**: No same-utterance content → wait for next utterance from that user.
- **Another user speaks before the invoker**: Ignore; keep waiting for the invoker’s next utterance until it arrives or a timeout (e.g. 15s) clears `expectDirectInputFromUserId`.

---

## 3. Implementation order (suggested)

1. **voiceChatEvents config**  
   Add a small module or config entry: `voiceChatEvents` array with one event (e.g. `{ id: 'game_death_medic', keywords: ['shot', 'dead', 'downed', 'killed', 'blown up', 'medic', 'defib'], ... }`). Add a helper `detectEvents(compressedText)` that returns matched event ids.

2. **Rolling 5s buffer (in pipeline)**  
   In the voice pipeline, maintain a 5-second rolling window of audio (or of per-user segments). When the window updates, run STT on the window (or on new segments and merge), then compress and store (in-memory per session for v1). Ensure this does not replace the existing "full utterance" path; the pipeline can have two flows: (a) end-of-utterance → full turn as today, (b) rolling window → transcript + compress → save for job.

3. **Quick-comment job**  
   New job (e.g. `voice-quick-comment-job.js`): runs every 10–15s (or is triggered by pipeline). For each active session with a recent compressed window, run `detectEvents(compressedText)`. If any event matches and cooldown allows, call LLM for a short line, then `playInSession` or send to text channel. Enforce cooldown per session.

4. **Keyword trigger in pipeline**  
   In the pipeline’s `onStart` path, after STT: if trigger "parrott" / "sir parrott" is present, extract same-utterance input or set `expectDirectInputFromUserId` and consume next utterance from that user. Use that input for the LLM/tools turn.

5. **Tests and tuning**  
   Unit tests for trigger regex and same-utterance vs next-utterance; manual test for rolling buffer and event detection.

---

## 4. Summary table

| Feature | Description |
|--------|--------------|
| **Rolling 5s buffer** | Last 5s of voice per session → transcribe → compress → save (in-memory v1). |
| **voiceChatEvents** | Array; v1 = one event: shot/dead/downed/killed/blown up/medic/defib. |
| **Quick-comment job** | Runs periodically (or on update); detects events in compressed text; generates short comment; TTS in session or post to channel; cooldown. |
| **Keyword trigger** | "parrott" / "sir parrott" → use speaker’s following words (same or next utterance) as input. |

This plan leaves the existing voice session architecture intact and adds the rolling buffer, event detection, job, and keyword trigger on top.
