# 🤖 Discord Bot Assistant

> **⚠️ STATUS: BETA VERSION**
> This project is currently in its **Beta** phase. While the core engine is fully functional, some features may still need tweaking or further development. Please use caution when running mass commands on production servers. If you use this bot and find any bugs or issues, please don't hesitate to leave feedback!

Discord Bot Assistant is an AI-powered management bot designed to understand natural, everyday language. Instead of relying on rigid commands, you can converse with the bot naturally, and it can execute dozens of complex commands in a **SINGLE SENTENCE**.

Built with the **ASYNX6** architecture and powered by LLMs (e.g., GPT-4o-mini via OpenRouter), this bot is capable of independently managing server hierarchies, permissions, and automated channel designs.

---

## 🔥 Key Features

### Core Capabilities
- **🧠 Natural Language Processing (NLP)**
  No need to memorize commands! Just chat with the bot normally. Example: *"Bot, create 5 roles from Founder to Member, then create an Admin category with 3 channels inside it."*

- **⚡ Multi-Action Pipeline**
  A single request from the user is automatically parsed into a sequence of dependent actions. The bot understands dependencies (e.g., creating a Category first before creating Channels inside it).

- **🛡️ Auto-Permission & Hierarchy Intelligence**
  When asked to create a "Founder" or "Owner" role, the bot **automatically** assigns `Administrator` privileges. For "Moderator" roles, it automatically grants kick/ban/manage messages permissions without needing explicit instructions.

- **🎨 Auto-Styling & Community Support**
  - Automatically assigns fitting HEX colors to new roles.
  - Intelligently generates aesthetic names and emojis for channels.
  - Fully supports modern Discord Community Server features, including **FORUM**, **ANNOUNCEMENT**, and **STAGE** channels, in addition to TEXT and VOICE.

- **⏪ Snapshot & Master Undo**
  Whenever the bot performs mass structural changes (like creating or deleting multiple channels and roles), it **automatically creates a backup** in your MongoDB database. If you make a mistake, simply say *"Undo"*, and the server will revert to its previous state.

- **💬 Live Progress Output**
  When handling heavy requests (e.g., creating 50 channels at once), the bot displays a live *Progress Message* that is automatically updated into a casual, AI-generated summary once all tasks are complete.

### New in v1.3.0 — Self-Healing, Vision & File Utilities 🩺
- **📸 Smart Vision Detection** — Bot reads image attachments from Discord in two ways: (A) user uploads image + tags bot, (B) user replies to an image + tags bot. Both direct attachments and reply references are scanned.
- **🔄 Provider-Driven Vision Validation** — The bot **does not maintain a hardcoded allow/deny list of vision-capable models**. Instead, it just sends the request (with images) to the provider (9Router / OpenRouter). If the active model can't process images, the provider returns a 400/422 with an "image"/"vision"/"multimodal" error → the bot **transparently retries as text-only** and prepends a friendly Indonesian notice ("Model saya saat ini tidak mendukung Vision/Image, tapi tenang, request teks lu bakal gw proses normal kok"). New model? Just flip `ACTIVE_MODEL` and it just works.
- **🩹 Self-Healing Dynamic Commands** — When a generated handler crashes at runtime, the bot auto-captures the error, sends it back to the AI, regenerates a fixed version, validates, re-saves (overwrite), re-registers, and re-executes — up to 3 attempts.
- **📂 Enhanced Local File Viewer** — `list dynamic` (or "lihat file yang udah kamu buat") now reports file size, creation date, load status, and an extracted summary (JSDoc, // comment, or first meaningful line) for every generated command.
- **🧪 127 Unit Tests** — Up from 113 in v1.2.0. New: provider-error detection (`isVisionUnsupportedError`) and multimodal content builder (`buildUserContent`).

### New in v1.4.0 — Super Agent, Anti-Phishing, Interactive UI & Auto-Diagnostic 🛡️
- **🛡️ Real-Time Cross-Channel Anti-Phishing System** — Every incoming message is fingerprinted (normalized text + URL hash + per-image hash). If a user posts the *same composite hash* across **> 3 different channels** within a **2-second sliding window**, the bot immediately deletes the message from every tracked channel, locks the user for 60 seconds, and emits a `security.phishing.detected` log line. Zero AI involvement in the hot path — the decision is deterministic and O(1) per message.
- **🎛️ Unified AI Configuration via `.env`** — All AI provider settings now live in `.env` under `AI_APIKEY`, `AI_BASE_URL`, `AI_MODEL`, `AI_FALLBACK_MODEL`. `AI_APIKEY` is the single canonical credential — any OpenAI-compatible provider works (OpenRouter, DeepSeek, OpenAI, Anthropic-via-router, etc.). The legacy `OPENROUTER_API_KEY` is no longer honored; rename it to `AI_APIKEY` in your `.env` when migrating.
- **⏰ Dynamic Cron Scheduler & System Status Registry** — Built-in scheduler supports `dailyAt: "HH:MM"` (with IANA timezone), 5-field cron expressions, and one-shot delays. Every registered job is mirrored to `data/system_registry.json` so users can ask *“@Bot system apa yang lagi jalan?”* and get a transparent list. Toggle any system on/off via natural chat: *“@Bot turn off daily reminder”*.
- **💾 Automated `.env` Writer & Token Solicitor** — When AI generates code that requires an external API key (e.g. `WEATHER_API_KEY`, `STRIPE_SECRET_KEY`), the AI **pauses**, asks the user in Discord for the token, and once received atomically appends it to `.env` (with backup). Bot then resumes code generation with the new env var available.
- **🖼️ Discord Interactive Buttons (60s strict expiry)** — Critical confirmations now use native Discord button rows instead of text-based “Ya/Tidak”. Custom IDs encode `expiresAt` so the bot can deterministically expire any button after 60 seconds even if the bot restarts mid-confirmation.
- **🤖 `@Bot diagnostic`** — Returns a Rich Embed with: free RAM (MB), CPU model + cores, MongoDB connection state, total dynamic commands cached, and estimated AI token spend today. Useful for at-a-glance health checks.
- **🧪 335 Unit Tests** — Up from 127 in v1.3.1. New: `antiPhishing` (32), `systemRegistry` (30), `scheduler` (26), `envWriter` (33), `tokenSolicitor` (25), `interactiveUI` (24), `diagnostic` (28), `envValidator` updates (10).

### New in v1.2.0 — Dynamic Autonomous Learning 🧬
- **🧩 Self-Extending Commands** — Bot can generate, validate, save, and hot-reload new commands on the fly. Ask for a feature that doesn't exist; the bot creates it.
- **🔍 Code Safety Validator** — Generated code goes through syntax check (`node --check`), forbidden-pattern scan (eval, child_process, fs.rm, spawn, exec, process.exit), and required-export check before being persisted.
- **⚡ Hot-Reload Without Restart** — New commands are dynamically imported with cache-busted URLs and registered in an in-memory registry, available seconds after approval.
- **🗂️ Persistent Local Cache** — Generated commands live in `commands/dynamic/handle_<name>.js`. They survive bot restarts (auto-loaded at startup) and are never regenerated from scratch if they already exist.
- **🤝 User Confirmation Gate** — Before any code generation, the bot asks **Ya/Tidak** in Discord. No silent writes. No accidental executions.
- **📜 List Dynamic Commands** — Type `list dynamic` or `dynamic list` to the bot to see all generated commands.

### New in v1.1.0 — Production Hardening
- **📊 In-Memory Metrics** — Track command usage, failure rate, top users, AI token spend. Type `stats` or `metrics` to the bot.
- **⏱️ Smart Cooldowns** — Per-user cooldowns + stricter cooldowns for destructive actions (NUKE, BAN, KICK, MASS_ROLE) to prevent accidental abuse.
- **🔁 AI Retry with Fallback** — Failed LLM calls retry with exponential backoff; falls back to GPT-3.5-turbo after 3 attempts.
- **📝 Structured Logger** — JSON-formatted logs with log levels (`LOG_LEVEL=DEBUG|INFO|WARN|ERROR`), automatic secret redaction, optional file sink (`LOG_FILE_PATH`).
- **🛡️ Startup Validation** — Bot refuses to start if `.env` is missing required vars (TOKEN_BOT, DISCORD_OWNER_ID) or contains placeholder values. Gives a clear actionable error message.
- **🛑 Graceful Shutdown** — Handles `SIGINT` / `SIGTERM` cleanly: cleans up cooldowns, in-memory context, and disconnects from Discord without leaving zombie processes.
- **💾 Context Persistence** — Bot's multi-turn context (when AI asks "mana URL-nya?") can optionally persist to MongoDB so it survives restarts.
- **🧪 Built-in Test Suite** — 56 unit tests using Node 22's native test runner. Run with `npm test`.

---

## 🛠️ Tech Stack

- **Node.js** v22+ (uses native `node:test`, `node:fs`, `node:path`)
- **Discord.js** v14
- **Mongoose** for MongoDB Database & Snapshot System
- **OpenAI / OpenRouter API** (Recommended: GPT-4o-mini) for the AI brain

---

## ⚙️ Installation & Setup

1. **Clone this repository**
   ```bash
   git clone https://github.com/asynx6/Discord-Bot-Assistant.git
   cd Discord-Bot-Assistant
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure Environment Variables**
   Create a `.env` file in the root directory and fill it in:
   ```env
   TOKEN_BOT=your_discord_bot_token
   DISCORD_OWNER_ID=your_discord_id
   MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/yourdbname

   # AI provider (v1.4.0 — any OpenAI-compatible API works)
   AI_APIKEY=your_ai_apikey
   AI_BASE_URL=https://openrouter.ai/api/v1
   AI_MODEL=openai/gpt-4o-mini
   AI_FALLBACK_MODEL=openai/gpt-3.5-turbo
   ```

   **Required:** `TOKEN_BOT`, `DISCORD_OWNER_ID`
   **Recommended:** `AI_APIKEY` (bot refuses AI calls without it. Legacy `OPENROUTER_API_KEY` is no longer honored — rename it to `AI_APIKEY` when migrating.)
   **Optional:** `MONGODB_URI` (snapshot/undo + context persistence disabled if missing)
   **Optional tuning:**
   - `LOG_LEVEL=DEBUG|INFO|WARN|ERROR` (default `INFO`)
   - `LOG_FILE_PATH=./bot.log` (if set, also writes JSON logs to this file)
   - `SCHEDULER_TIMEZONE=Asia/Jakarta` (IANA timezone for daily jobs)

   *Helpful Links:*
   - Get your MongoDB URI by creating a free database cluster at [MongoDB Atlas](https://www.mongodb.com/atlas/database).
   - Get your API Key and select your AI model (e.g., GPT-4o-mini) at [OpenRouter](https://openrouter.ai/).

   > *Note: For security reasons, the bot will only respond to the user ID registered in `DISCORD_OWNER_ID`.*

4. **Run the Bot**
   ```bash
   npm start
   # or with auto-reload during dev:
   npm run dev
   ```

5. **Run the Tests**
   ```bash
   npm test
   ```

---

## 📖 Usage Examples

Simply mention the bot in a channel and speak to it naturally:

**1. Mass Role & Channel Creation**
> *"@Bot please create 10 roles from member up to founder and figure out the best permissions for them. Then create 3 categories (Public Interaction, Admin, Announce) and put 5 channels in each containing a mix of text, voice, and forums. Use emojis for the names!"*

**2. Server Cleanup (Nuke Filter)**
> *"@Bot delete all channels and roles in this server, but spare this current channel so we can still chat."*

**3. Quick Moderation**
> *"@Bot mute @UserA for 10 minutes and kick @UserB."*

**5. View Bot Metrics (new in v1.1.0)**
> *"stats"* or *"metrics"* — shows uptime, request counts, failure rate, top users, top actions.

**6. Reset Metrics (new in v1.1.0)**
> *"reset stats"*

**7. Create a New Command on the Fly (new in v1.2.0)**
> *"@Bot bikin command gacor yang reply 'mantap' kalo dipanggil"*
>
> Bot replies with a confirmation prompt:
> ```
> 🔧 Fitur gacor belum ada nih.
> Intent: reply 'mantap' kalo dipanggil
> Bot bakal:
>   1. 🤖 Generate kode JavaScript via AI
>   2. 🔍 Validasi syntax + safety
>   3. 💾 Simpan ke commands/dynamic/handle_gacor.js
>   4. ⚡ Hot-reload & langsung bisa dipake
> Reply **Ya** untuk lanjut, atau **Tidak** untuk batal.
> ```
>
> You reply **Ya** → bot generates, validates, saves, hot-reloads, then runs it.
> Next time you ask for "gacor", the cached file is used instantly — no regeneration.

**8. List Dynamic Commands (new in v1.2.0)**
> *"list dynamic"*
> Shows all commands stored in `commands/dynamic/`.

---

## 🧪 Testing

The project ships with a built-in test suite using Node 22's native test runner. No external test framework is needed.

```bash
npm test
```

Test coverage:
- `tests/logger.test.js` — structured logging, level filtering, secret redaction
- `tests/cooldown.test.js` — per-user cooldowns, action-specific cooldowns, cleanup
- `tests/metrics.test.js` — request/action tracking, failure rate math
- `tests/envValidator.test.js` — startup env validation, placeholder rejection, AI_APIKEY single-canonical credential (legacy OPENROUTER_API_KEY rejected)
- `tests/aiHandler.test.js` — JSON parsing across all response shapes, retry classification
- `tests/contextManager.test.js` — multi-turn context, eviction, ownership check
- `tests/dynamicExecutor.test.js` — name sanitization, code validation (syntax + forbidden patterns), save/register/execute lifecycle, hot-reload, cache hits
- `tests/visionHandler.test.js` — image extraction, provider-driven vision error detection
- `tests/antiPhishing.test.js` — composite-hash fingerprinting, cross-channel threshold detection, sliding-window cleanup
- `tests/systemRegistry.test.js` — JSON-backed CRUD, atomic writes, parseSystemCommand natural-language parsing
- `tests/scheduler.test.js` — dailyAt cron, timezone math, one-shot timers, error capture
- `tests/envWriter.test.js` — atomic read/write/update with backup, key validation
- `tests/tokenSolicitor.test.js` — token-required detection in generated code, solicit message builder
- `tests/interactiveUI.test.js` — button row builders, customId encoding, 60s expiry enforcement
- `tests/diagnostic.test.js` — RAM/CPU/Mongo/tokens/dynamic-count health snapshot, embed formatter

---

## 🩺 Self-Healing Flow (v1.3.0)

When a generated command crashes at runtime:

1. Bot catches the error from `executeDynamicCommand()`
2. Logs `dynamic.heal.runtime_error`
3. Re-prompts AI with: original intent + previous code + error message
4. AI regenerates a fixed version
5. Bot validates → saves (overwrite) → hot-reloads → executes again
6. Max 3 attempts. If all fail, user is told to retry with clearer intent.

---

## 🛡️ Anti-Phishing System (v1.4.0)

Every incoming message is fingerprinted deterministically (no AI in the hot path):

1. **Normalize text** — lowercase, strip URLs, collapse whitespace
2. **Hash images per-URL** — same image posted twice = same hash
3. **Composite hash** — combines text-hash + sorted image-hashes
4. **Track per-user sliding window** — 2-second window across all channels
5. **Threshold: > 3 distinct channels** in window with same hash → phishing

If triggered, the bot:
- Deletes the offending message in **every tracked channel** instantly
- Logs `security.phishing.detected` with full evidence (user, channels, hashes)
- Cooldown-locks the user for 60 seconds

```text
@Bot @everyone claim free nitro at http://scam.example  ← channel A
@Bot @everyone claim free nitro at http://scam.example  ← channel B
@Bot @everyone claim free nitro at http://scam.example  ← channel C
@Bot @everyone claim free nitro at http://scam.example  ← channel D
                                                            ↑
                                              triggered (4 channels in <2s)
                                              all 4 messages deleted
```

---

## ⏰ Scheduler & System Status Registry (v1.4.0)

```text
@Bot turn on daily reminder
@Bot turn off daily reminder
@Bot system apa yang lagi jalan?
@Bot system apa aja yang udah kamu buat?
```

Status persists to `data/system_registry.json` (atomic write: tmp + rename).
Supports: `dailyAt: "12:00"` (with timezone), 5-field cron, and one-shot timers.

---

## 💾 Automated Token Solicitor (v1.4.0)

When AI-generated code references a missing API key (e.g. `process.env.WEATHER_API_KEY`):

1. AI pauses code generation
2. Bot replies with a Discord Modal asking for the token
3. User submits token via Modal
4. Bot atomically writes token to `.env` (with `.env.bak` backup)
5. AI resumes code generation with the new env var

---

## 🖼️ Interactive Confirmation UI (v1.4.0)

Critical confirmations now use native Discord button rows. Custom IDs encode `expiresAt` so:

- Buttons auto-disable after **60 seconds** (strict)
- Click handler validates expiry before executing
- Works across bot restarts (no in-memory state required)

```text
┌─────────────────────────────────┐
│ Konfirmasi: bikin command gacor │
│ > Bot akan generate + hot-reload │
│                                  │
│  [ ✅ Ya ]      [ ❌ Tidak ]     │
└─────────────────────────────────┘
       ⏱ Expires in 60s
```

---

## 🤖 Diagnostic Command (v1.4.0)

```text
@Bot diagnostic
```

Returns Rich Embed with:
- 🧠 **Free RAM** (MB)
- ⚙️ **CPU** model + cores
- 🗄️ **MongoDB** connection state
- 🧩 **Dynamic commands** cached on disk
- 💸 **Token spend** estimated today

---

## 📂 Enhanced Local File Viewer (v1.3.0)

```text
@Bot list dynamic
```
or
```text
@Bot lihat semua file yang udah kamu buat
```

Output example:
```
🧩 Dynamic Commands (2):

**gacor** 🟢 loaded
  📄 handle_gacor.js (0.42 KB)
  📅 Dibuat: 19/06/2026 11.45
  💡 Replies "mantap" when called

**ping_test** 🟢 loaded
  📄 handle_ping_test.js (0.18 KB)
  📅 Dibuat: 19/06/2026 10.30
  💡 Replies pong to ping command
```

Summary is extracted from (in order):
1. First JSDoc block (`/** ... */`)
2. First `//` comment line
3. First meaningful code line

---

## 🧬 Dynamic Commands (v1.2.0)

The bot can generate and execute new commands without restarting.

**Folder layout:**
```
commands/
└── dynamic/
    └── handle_<name>.js    ← auto-generated, hot-reloadable
```

**Each generated file must export either:**
```js
export default async function (message, params) { ... }
```
or
```js
export async function handle(message, params) { ... }
```

**Safety guarantees enforced by the validator:**
- Syntax checked via `node --check --input-type=module`
- Forbidden patterns blocked: `eval()`, `new Function()`, `child_process`, `process.exit()`, `fs.rm()`, `spawn()`, `exec()`
- Max file size: 50KB
- Must export a usable handler function

**List at runtime:**
```bash
npm run dynamic:list
```
or type `list dynamic` to the bot.

---

## 🤝 Contribution & Feedback
As this is a Beta release, there might be unexpected bugs or edge cases. If you encounter any issues or have suggestions, please provide feedback or open an issue!

Made with 💻 and ☕.