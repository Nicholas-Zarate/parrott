# Agent container runtime (Kubernetes / AWS / other)

The agent is a **Discord bot** (Node.js). It does **not** expose an HTTP server; it connects **outbound** to Discord’s gateway and APIs. Apart from “HTTP access,” you need the following in your container (Kubernetes, ECS, etc.).

---

## 1. Network (outbound only)

- **Discord**
  - `wss://gateway.discord.gg` (WebSocket)
  - `https://discord.com` (REST API, CDN)
- **Supabase**
  - Your `SUPABASE_URL` (HTTPS)
- **APIs used by features**
  - OpenAI: `https://api.openai.com`
  - ElevenLabs (TTS): `https://api.elevenlabs.io`
  - Tavily (search/lyrics/jokes): `https://api.tavily.com`
  - Anthropic / xAI if you use those model providers

No inbound HTTP port is required unless you add a health endpoint yourself.

---

## 2. Environment variables

Load `dotenv` from a file **or** set env in the container (e.g. Kubernetes `env` / `envFrom` / Secrets).

### Required to run

| Variable | Purpose |
|----------|---------|
| `DISCORD_BOT_TOKEN` | Discord bot token (login). |

### Required for Supabase (config, logs, restart requests, etc.)

| Variable | Purpose |
|----------|---------|
| `SUPABASE_URL` | Supabase project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_ANON_KEY` | Supabase key (service role for restart-request consumer and full DB access). |

### Required for @mention and text/voice AI

| Variable | Purpose |
|----------|---------|
| `OPENAI_API_KEY` | Used for mentions and default voice model. |

### Optional (feature-specific)

| Variable | Purpose | Default / note |
|----------|---------|-----------------|
| `OPENAI_MODEL` | Model for mentions/voice/jokes. | e.g. `grok-4-1-fast-non-reasoning` / `gpt-4o-mini` |
| `VOICE_MODEL` | Model for voice pipeline. | From parrot config or `OPENAI_MODEL` |
| `ANTHROPIC_API_KEY` | If using Anthropic provider. | — |
| `XAI_API_KEY` | If using xAI provider. | — |
| `ELEVENLABS_API_KEY` | TTS (voice). | Required for voice TTS |
| `ELEVENLABS_VOICE_ID` | TTS voice. | Has code default |
| `TAVILY_API_KEY` | Web search / lyrics / make-joke-like. | Optional |
| `MENTION_CHANNEL_IDS` | Comma-separated channel IDs for @mention allowlist. | If unset, channel names from code are used |
| `BLOCKED_DISCORD_ROLE_NAMES` | Comma-separated role names to block. | Optional |
| `INVITE_PERMISSIONS` | Discord permission integer for invite URL. | `562955322199104` |
| `MENTION_DEBUG_GATEWAY` | `1` to log raw gateway MESSAGE_CREATE. | Debug only |

### Jobs / scheduler

| Variable | Purpose | Default |
|----------|---------|---------|
| `ANNOUNCEMENT_CRON` | Cron for announcement job. | `0 */6 * * *` |
| `ANNOUNCEMENT_RUN_ON_START` | `1` = run announcement on startup. | — |
| `ANNOUNCEMENT_WINDOW_HOURS` | Window for announcement job. | `6` |
| `VOICE_QUICK_COMMENT_INTERVAL_MS` | Interval for voice quick-comment job. | `15000` |
| `VOICE_QUICK_COMMENT_COOLDOWN_MS` | Cooldown per guild. | `45000` |
| `RESTART_REQUEST_POLL_INTERVAL_MS` | Poll interval for restart_requests. | `15000` |
| `RESTART_REQUEST_PARROT_CHANNEL_NAME` | Channel name for restart messages. | `parrot` |
| `RESTART_REQUEST_VOICE_CHANNEL_NAME` | VC name for restart (null = first VC). | `null` |
| `RESTART_REQUEST_DEFAULT_GUILD_ID` | Default guild for restart requests. | — |

### TTS / voice tuning

| Variable | Purpose |
|----------|---------|
| `TTS_QUICK_COMMENT_MODEL` | ElevenLabs model for quick comments. |
| `ELEVENLABS_TTS_SPEED` / `ELEVENLABS_TTS_STABILITY` / etc. | TTS parameters. |
| `TTS_DERIVE_SETTINGS_FROM_TEXT` | Disable derivation from text if `0`/`false`/`no`. |
| `VOICE_STREAM_TIMEOUT_MS` | Voice stream collect timeout. |

---

## 3. Runtime dependencies (inside the image)

- **Node.js**  
  Version that matches the project (see `agent/package.json` / engines if set).

- **ffmpeg**  
  Used for voice (opus → PCM, PCM → mp3 for STT). The app uses the `ffmpeg-static` npm package, which ships a binary in `node_modules`. No system ffmpeg is required unless you want to override; then install ffmpeg in the image and ensure it’s on `PATH` (or the code falls back to `ffmpeg` when `ffmpeg-static` is missing).

- **Native addons**  
  `@discordjs/opus` (and optionally `opusscript`) are used for Opus. In Docker/Kubernetes, use an image that has build tools for native modules **or** use a base image with prebuilt binaries (e.g. `node:...-slim` and ensure `npm install` runs in a way that gets the right opus binary for the image OS/arch).

---

## 4. Process and lifecycle

- **Start command**  
  `npm start` or `node discord-voting-bot.js` from the `agent` directory (after `npm install`).

- **Working directory**  
  Set to the `agent` directory so `dotenv` can find `.env` if you use one (otherwise rely on env injection).

- **Single process**  
  One bot instance per token. For scaling, run multiple replicas only if you use different Discord tokens (multiple bots). One token = one connection to Discord; multiple pods with the same token will hit rate limits / duplicate events.

- **Graceful shutdown**  
  On SIGTERM/SIGINT, Node will exit; Discord.js will close the gateway. Prefer giving the process a short grace period (e.g. 15–30s) in Kubernetes `terminationGracePeriodSeconds` so the bot can leave voice and clean up.

---

## 5. Kubernetes checklist (summary)

- **Image**: Node base + `npm install` (+ optional system ffmpeg).
- **Env**: At least `DISCORD_BOT_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (or anon), `OPENAI_API_KEY`; add others as needed. Prefer Secrets for tokens and keys.
- **Network**: Outbound HTTPS/WSS to Discord, Supabase, OpenAI, ElevenLabs, Tavily (as used). No inbound port needed unless you add a health server.
- **No HTTP service**: Do **not** expect a listening port for the agent; use a **liveness/readiness probe** that checks process or a small sidecar if you need one.
- **Replicas**: Use 1 replica per Discord bot token; scale by adding more bots (tokens) and deployments, not more replicas of the same token.

---

## 6. Optional: health endpoint

The agent does not open an HTTP server. If your platform requires a HTTP health check, you can add a tiny server (e.g. express or `http.createServer`) that listens on a port and returns 200 when the Discord client is ready (e.g. `client.isReady()`). Then expose that port and point liveness/readiness at it.
