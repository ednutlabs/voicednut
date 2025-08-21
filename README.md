# Voicednut API

## 🧠 ElevenLabs + Twilio + Telegram Bot Integration

This Node.js-based API allows you to initiate, stream, and log phone calls via Twilio, powered by ElevenLabs Conversational AI — and notify users on Telegram using grammY bot.

---

## ✅ Features

- 🔁 Inbound & outbound call handling
- 🧠 Real-time AI conversations with ElevenLabs
- 🎧 WebSocket media streaming (Twilio <-> ElevenLabs)
- ✅ Call status tracking and metadata storage
- 📝 Post-call transcription + sentiment & metadata
- 🔊 Audio summary to Telegram user
- ⚙️ SQLite3 local persistence
- ✅ Test suite via Mocha + Chai + Sinon
- 🔄 GitHub Actions CI & AWS EC2 deployment

---

## 📦 Prerequisites

- Node.js v18+
- Valid `.env` (see `.env.example`)

An advanced README for developers and integrators working with the Voicednut project. This file covers the API and bot components, deployment considerations, and examples you can use to test and extend the system.

## Overview

Voicednut glues together three core systems:

- Twilio (voice + media webhooks) — handles programmable voice calls and streaming audio.
- ElevenLabs Conversational AI — drives agent voice responses, transcriptions, and summary audio.
- grammY (Telegram) — notifies users with call summaries, transcripts, and audio snippets via a Telegram bot.

The codebase is purpose-built to:

- Handle inbound and outbound calls
- Stream media between Twilio and ElevenLabs in near real-time
- Persist call metadata and transcripts to a small SQLite DB for audit and retrieval
- Send post-call summaries and audio to Telegram users

## Architecture (high level)

- Client (Twilio) -> HTTP webhook -> `api/app.js` (Express)
- `routes/` contains endpoints for streaming, TwiML responses, and callbacks
- Streaming component proxies audio frames between Twilio and ElevenLabs
- After-call: ElevenLabs posts transcription and summary webhooks to the server
- Server persists metadata in `db/data.db` and notifies Telegram via `bot/`

## Repository layout

- `api/` — Express application (`app.js`) and package manifest for the API service. This is the runtime that Twilio and ElevenLabs talk to.
- `bot/` — grammY Telegram bot, commands and helpers used to notify users and accept small bot-driven commands.
- `routes/` — handlers used by the API for Twilio webhooks, streaming endpoints, transcription, and TTS.
- `functions/` — stateless helper functions used by routes and unit tests (e.g., `placeOrder.js`, `checkInventory.js`).
- `db/` — SQLite file (`data.db`) and `db.js` helper for queries.
- `test/` — unit tests for functions and integration-like smoke tests.

## Environment variables (detailed)

Create a `.env` in the project root (do not commit). Example keys the application reads:

- PORT=3000
- TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
- TWILIO_AUTH_TOKEN=your_twilio_auth_token
- TWILIO_PHONE_NUMBER=+15551234567
- ELEVENLABS_API_KEY=elevenlabs_xxx
- ELEVENLABS_AGENT_ID=agent-uuid-or-id
- TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
- TELEGRAM_CHAT_ID=987654321  # optional: where to send notifications
- NODE_ENV=development

Security tips:

- Use a secrets manager for production. Keep `.env` out of source control via `.gitignore`.
- Validate Twilio request signatures on webhook endpoints to ensure calls originate from Twilio.

## API: endpoints and examples

General: the API returns JSON for REST endpoints and TwiML or webhook handling where appropriate. Replace HOST with your public URL.

1) Start an outbound call

POST /outbound-call

Request JSON example:

{
  "number": "+1234567890",
  "prompt": "You are an assistant. Keep responses short.",
  "first_message": "Hello, this is a reminder call",
  "user_chat_id": 123456789
}

Response: 202 Accepted with a call SID and tracking metadata.

2) Inbound calls from Twilio

POST /inbound-call

Twilio hits this endpoint when your Twilio number receives a call. The handler returns TwiML or starts a streaming session with ElevenLabs. Test locally with ngrok and update the Twilio webhook URL.

3) Call status callback

POST /status

Twilio will POST call lifecycle events (queued, ringing, in-progress, completed). Persist useful fields (CallSid, From, To, Status, Duration).

4) ElevenLabs webhooks

- POST /status/transcription — full transcript JSON (words, timestamps, confidence, sentiment)
- POST /status/audio — summary audio (usually base64 payload or URL depending on ElevenLabs configuration)

For exact payload shapes, consult ElevenLabs webhook docs and inspect what your agent sends in development.

## Streaming flow (detailed)

1. Twilio open media stream (Media Streams) to your `routes/stream.js` handler.
2. Server relays audio frames to ElevenLabs conversational API via a WebSocket or HTTP streaming protocol.
3. ElevenLabs sends intermediate responses (if configured) and final transcript/audio via webhooks.
4. Server maps those responses back to the Twilio call (TwiML or PSTN audio), records metadata, and sends a notification via Telegram.

Important notes:

- Streaming audio is stateful; ensure proper reconnection backoff and track per-call sessions by `CallSid`.
- Keep audio chunk sizes small during development to avoid buffer pressure.

## Database

The project uses SQLite for convenience. `db/db.js` contains helpers to create and query a simple schema. Typical tables:

- calls(id, call_sid, from_number, to_number, status, duration, started_at, ended_at, metadata_json)
- transcripts(id, call_id, text, words_json, sentiment_json, created_at)

For production you can migrate to Postgres or another RDBMS.

## Bot (`bot/`) — setup and usage

The `bot/` folder implements a grammY Telegram bot. It performs two roles:

- Send post-call notifications and audio summaries to users
- Offer small interactive commands for admins (e.g., `/menu`, `/users`, `/promote`)

Setup

1. Create a Telegram bot with BotFather and get the `TELEGRAM_BOT_TOKEN`.
2. Set `TELEGRAM_CHAT_ID` (or send a message to the bot and read the chat ID in logs while developing).
3. Run the bot with the same Node environment as the API, or run it separately via `node bot/bot.js`.

Common commands (implemented under `bot/commands`):

- `/help` — lists commands
- `/menu` — shows a simple menu
- `/users` — list known users (from `db/`)
- `/adduser` `/removeuser` `/promote` — admin user management helpers

Example: send a post-call summary from the API to the bot

1. After call complete, API writes transcript and summary to the DB.
2. API calls a bot helper or emits an event that `bot/` listens to, which sends a message and optional audio to `TELEGRAM_CHAT_ID`.

## Testing

- Unit tests: Mocha + Chai + Sinon (see `test/`)
- Run all tests locally:

```bash
npm test
```

- Integration: to exercise Twilio workflows locally, use `ngrok` to expose a public HTTPS endpoint and update Twilio webhooks.

## Local development tips

- Use `npm run dev` (if defined) or `node api/app.js` to start the API.
- Use `ngrok http 3000` and point Twilio to the public URL (remember ngrok gives HTTPS).
- Keep logs visible; webhook payloads are the fastest way to debug issues.

## Deployment

- This service can be deployed on any Node-friendly host (EC2, DigitalOcean, Heroku). For production:
  - Use a managed database
  - Store secrets in a secret manager (AWS Secrets Manager, Vault)
  - Run multiple instances behind a load balancer and use a centralized store for call/session state (Redis) if you need horizontal scaling

## Observability & troubleshooting

- Log the Twilio CallSid and correlate logs across request handlers.
- Persist raw webhook payloads (redact secrets) for replay during debugging.
- When streaming problems occur, verify: network, call session lifecycle, and ElevenLabs session tokens.

## Recommended next improvements

- Add Twilio request signature verification middleware.
- Add an explicit `.env.example` file with comments for each variable.
- Add a small Postman collection or OpenAPI spec for the REST endpoints.
- Add end-to-end integration tests that mock Twilio & ElevenLabs responses.

## Contributing

Please open issues or PRs. Add tests for new features and keep changes scope-limited.

## License

MIT — see `LICENSE`.
