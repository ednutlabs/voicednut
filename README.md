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
- Twilio account + verified phone number
- ElevenLabs API key & agent ID
- Telegram bot token for notifications
- (Optional) Ngrok or deployed HTTPS domain

---

## ⚙️ Setup Instructions

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables:
```bash
cp .env.example .env
# edit .env to include keys from Twilio, ElevenLabs, Telegram
```

3. Start the server:
```bash
npm run dev
```

---

## 🧪 Testing

Run all tests:
```bash
npm run test
```

Run with coverage:
```bash
npm run test:coverage
```

---

## 🛠 API Endpoints (no /api prefix)

### 📤 POST `/outbound-call`
Trigger outbound call via Twilio.
```json
{
  "number": "+1234567890",
  "prompt": "You are Eric, a car dealer...",
  "first_message": "Hi there!",
  "user_chat_id": 123456789
}
```

### ☎️ POST `/inbound-call`
Twilio calls this for incoming calls.

### 🧾 POST `/status`
Twilio status callback to track call completion.

### 📄 POST `/status/transcription`
ElevenLabs webhook for full transcript and metrics.

### 🔊 POST `/status/audio`
ElevenLabs audio summary webhook (base64-encoded audio).

---

## 🧪 Testing & Linting

Test file structure:
```
/test
  └── outbound.mocha.test.js
  └── inbound.mocha.test.js
  └── status.mocha.test.js
  └── config.mocha.test.js
```

Run with:
```bash
npm test
```

---

## 🚀 Deployment

See `.github/workflows/deploy.yml` for CI/CD setup:
- Automatically installs dependencies
- Runs tests
- Deploys to AWS EC2 instance
- Restarts `pm2` process on server

---

## 🔗 Documentation

- [Twilio Programmable Voice](https://www.twilio.com/docs/voice)
- [ElevenLabs Conversational AI](https://docs.elevenlabs.io/)
- [grammY Telegram Bot Framework](https://grammy.dev)

---

## 📄 License

MIT License - see `LICENSE`
