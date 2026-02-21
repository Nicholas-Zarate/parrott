# Voice pipeline: findings and changes

Summary of issues found while debugging "hey parrot" in voice chat not responding, and the changes made.

---

## High-level approach (is it right?)

**Yes.** The flow is: Discord voice → **Opus packets** → decode to **PCM** (with @discordjs/opus) → **ffmpeg** PCM→mp3 → **Whisper** STT → LLM → TTS → play. Raw Opus cannot be fed to ffmpeg as a file; it must be decoded to PCM (or wrapped in OGG). We use the decode path so we don’t need an OGG muxer. Single in-flight turn per session, keyword trigger ("parrot"/"parrott"), and optional "expect next utterance" when the user says only the trigger.

---

## Env / API keys

Voice listen + respond uses:

| Env | Purpose |
|-----|--------|
| **OPENAI_API_KEY** | Whisper STT (transcribe speech) |
| STT_MODEL | Optional; default `whisper-1`. Set to `gpt-4o-mini-transcribe` for faster STT. |
| STT_LANGUAGE | Optional; e.g. `en` to skip auto-detect and speed up transcription. |
| **ELEVENLABS_API_KEY** | ElevenLabs TTS (bot speaks) |
| ELEVENLABS_VOICE_ID | Optional; default voice if unset |
| TTS_USE_FLASH_FOR_MAIN | Optional; set to 1/true/yes to use ElevenLabs Flash model for main pipeline (lower latency). |
| VOICE_STREAM_TIMEOUT_MS | Optional; default 6000 ms max wait for voice stream (shorter = faster when Discord never sends stream end). |
| **VOICE_MODEL** | Optional env override. If set, used for voice LLM instead of DB. If unset, voice model comes from Supabase `parrot_runtime_config.voice_model` (editable from Settings → Model in the FE). Falls back to main `model` when `voice_model` is not set. Seed default: `gpt-4o-mini` (migration 054). |

---

## Finding 1: Circular dependency — `getSession is not a function`

**Symptom:** When the user said "@Parrott start listening", the tool failed with `Error executing tool start_listening: getSession is not a function`.

**Cause:** Require cycle: `with-tools` → `start_listening` → `abilities/voice` (index) → `session` → `pipeline` → `with-tools`. When the tool ran, `voice`’s exports were not fully set yet, so `getSession` was undefined.

**Changes:**

- **Lazy load pipeline in session** ([agent/abilities/voice/session.js](agent/abilities/voice/session.js)): Removed top-level `require('./pipeline')`. Pipeline is required only inside `endSession()` when calling `stopPipeline(guildId)`.
- **Voice tools require session directly**: [agent/tools/start_listening.js](agent/tools/start_listening.js), [agent/tools/stop_listening.js](agent/tools/stop_listening.js), [agent/tools/hang_out_in_voice.js](agent/tools/hang_out_in_voice.js), and [agent/tools/join_voice_and_squawk.js](agent/tools/join_voice_and_squawk.js) now `require('../abilities/voice/session')` (and play from `../abilities/voice/play`) instead of `require('../abilities/voice')`.

---

## Finding 2: First voice turn never completed — `processingTurn` stuck true

**Symptom:** First "started speaking" ran; every later one was skipped with `skip: ... processingTurn=true`. Bot never reached STT/LLM/TTS.

**Cause:** Code waited for the Discord voice stream to emit `'end'` (500 ms silence). In practice the stream often never ended. A 20 s timeout was added, but after the timeout we waited for `writeStream.on('finish')`. After `stream.destroy()`, the piped write stream often never emitted `'finish'`, so we waited forever and never cleared `processingTurn`.

**Changes:**

- **Stream collect timeout** ([agent/abilities/voice/pipeline.js](agent/abilities/voice/pipeline.js)): Race the stream `'end'` against a timeout (default 8 s, overridable with `VOICE_STREAM_TIMEOUT_MS`). On timeout, stop waiting and proceed with whatever audio we have.
- **No indefinite wait on write stream**: Removed the unbounded wait for `writeStream.on('finish')` after timeout. Added a 3 s cap on that wait; if it doesn’t finish in time we log and continue (later replaced by in-memory collection, so this path is no longer used).
- **Unpipe before destroy**: On stream timeout we call `stream.unpipe(writeStream)` before `stream.destroy()` so the write stream can close cleanly (later replaced by in-memory collection).

---

## Finding 3: Very small or corrupt opus file (63 bytes, ffmpeg -22)

**Symptom:** After timeout we saw `opus file too small (63 bytes)` or `ffmpeg failed: exit 4294967274` (signed -22). So we either had almost no audio or a bad file.

**Cause (partial):** Piping the Discord receive stream to `fs.createWriteStream()` caused backpressure. We switched to in-memory chunk collection. The **main** cause of ffmpeg -22 is in Finding 6.

**Changes (interim):**

- Collect audio in memory; handle objectMode; minimum opus size check; ffmpeg non-zero handled without throw. See Finding 6 for the actual fix.

---

## Finding 4: Keyword trigger — "parrot" vs "parrott"

**Symptom:** User said "hey parrot" (one t); trigger only matched "parrott" (two t’s).

**Change:** In [agent/abilities/voice/keyword-trigger.js](agent/abilities/voice/keyword-trigger.js) the regex was updated to accept both: `/\b(?:sir\s+)?parrott?\b\s*(.*)/is` so "parrot" and "parrott" (and "sir parrot(t)") all match.

---

## Finding 5: Logging for debugging

**Change:** Added logs in the voice pipeline so we can see: when someone starts speaking; when we skip (stopped/listening/processingTurn); when STT fails or is empty; the STT transcript; trigger check (no match / trigger only / remainder); when we wait for the next utterance; when we run the LLM; and when the pipeline registers the listener. Also log opus size/chunk count when skipping and ffmpeg exit code on failure.

---

## Finding 6: Root cause of ffmpeg -22 — wrong format (raw Opus not valid input)

**Symptom:** "hey parrot when did ww2 start?" (and similar) still produced `ffmpeg failed: exit 4294967274` (signed -22) even with in-memory collection and enough packets.

**Root cause:** We were writing **concatenated raw Opus packets** to a `.opus` file and running `ffmpeg -f opus -i file.opus ...`. **FFmpeg does not have a demuxer for raw Opus frames.** The `-f opus` option is for *encoding output*, not for reading input. Raw Opus is not self-delimiting; it requires a container (e.g. OGG) or must be decoded first. So ffmpeg was failing with invalid data (exit -22 / EINVAL).

**Correct approach:**

1. **Discord** `receiver.subscribe()` returns a stream of **Opus packets** (object mode; each chunk can be a Buffer or an object with payload).
2. **Decode Opus → PCM** using `@discordjs/opus`: `OpusEncoder` (same class used for encode) has a `decode(opusPacket)` method that returns 16-bit PCM. Discord voice receive is 48 kHz mono.
3. **Write PCM** to a `.pcm` file (s16le, 1 channel, 48000 Hz).
4. **FFmpeg** can read raw PCM with explicit format: `-f s16le -ac 1 -ar 48000 -i file.pcm -acodec libmp3lame -f mp3 output.mp3`. Format options must come **before** `-i`.

**Changes in** [agent/abilities/voice/pipeline.js](agent/abilities/voice/pipeline.js):

- Collect Opus packets in memory (unchanged).
- Create `OpusEncoder(48000, 1)` and decode each packet with `opusDecoder.decode(opusPacket)`; skip packets that throw; concatenate PCM buffers.
- If decoded PCM is too short (&lt; ~8 KB), skip the turn.
- Write PCM to a temp `.pcm` file.
- Run ffmpeg with `-f s16le -ac 1 -ar 48000 -i pcmPath -acodec libmp3lame -f mp3 convertedPath`.
- Rest of pipeline unchanged (Whisper gets the mp3).

**References:** FFmpeg formats docs (raw opus not a demuxer); [Answer Overflow: Decoding Opus from AudioReceiveStream](https://www.answeroverflow.com/m/1341582312227209216); @discordjs/opus README (encode/decode).

---

## File change summary

| File | Changes |
|------|--------|
| [agent/abilities/voice/session.js](agent/abilities/voice/session.js) | Lazy-require pipeline in `endSession` only. |
| [agent/abilities/voice/pipeline.js](agent/abilities/voice/pipeline.js) | **Opus→PCM via @discordjs/opus**, then **ffmpeg PCM→mp3** (no raw opus file); in-memory opus packet collection; stream timeout; min PCM length check; extra logging; `VOICE_STREAM_TIMEOUT_MS` env. |
| [agent/abilities/voice/keyword-trigger.js](agent/abilities/voice/keyword-trigger.js) | Trigger regex accepts "parrot" and "parrott". |
| [agent/tools/start_listening.js](agent/tools/start_listening.js) | Require `../abilities/voice/session` instead of `../abilities/voice`. |
| [agent/tools/stop_listening.js](agent/tools/stop_listening.js) | Same. |
| [agent/tools/hang_out_in_voice.js](agent/tools/hang_out_in_voice.js) | Same. |
| [agent/tools/join_voice_and_squawk.js](agent/tools/join_voice_and_squawk.js) | Require session and play directly. |

---

## What to do if it still doesn’t respond

1. Confirm **OPENAI_API_KEY** and **ELEVENLABS_API_KEY** are set in `.env`.
2. Restart the bot after any code or env change.
3. Say "hey parrot" (or "hey parrott when did ww2 start?") and watch logs for:
   - `stream collect timeout ... (N opus packets)` — if N is 0, Discord may not be sending audio (mic, permissions, or receiver).
   - `no opus packets received` or `decoded PCM too short` — not enough audio; try speaking longer or check mic.
   - `ffmpeg failed: exit … (PCM→mp3)` — PCM format or path issue; we use `-f s16le -ac 1 -ar 48000`.
   - `STT: "…"` — transcription is working; if there’s no reply after that, check LLM or TTS logs.

The pipeline now decodes Opus→PCM with @discordjs/opus and converts PCM→mp3 with ffmpeg; raw Opus is no longer written to a file.
