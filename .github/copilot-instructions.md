# VoicedNut AI Agent Instructions

## System Architecture

This is a Telegram bot system for AI-powered voice calls with three main components:

1. **Telegram Bot (`/bot`)**: Grammy.js-based bot handling user interactions and call management
2. **API Server (`/api`)**: Express.js server managing calls, AI, and real-time audio
3. **Mini App (`/bot/miniapp`)**: React + TypeScript Telegram WebApp for enhanced UI interactions
   - Built using `@telegram-apps/create-mini-app` CLI
   - Integrates with Telegram via `@telegram-apps/sdk` (tma.js)
   - Provides rich UI flows for all bot features
   - Hosted on Vercel and linked to bot

Key integration points:
- Twilio for voice calls (`api/routes/stream.js`)
- OpenRouter for AI models (`api/routes/gpt.js`)
- Deepgram for transcription (`api/routes/transcription.js`)
- SQLite for data persistence (`api/db/db.js`, `bot/db/db.js`)

## Core Patterns

### AI Response Formatting
- All AI responses must include '•' symbols every 5-10 words at natural pauses for TTS chunking
- Example: `Hello! • How can I assist you • with your call today?`
- See `api/routes/gpt.js` implementation

### Dynamic Function System
- Business logic is implemented through adaptable function templates
- New functions must follow the template pattern in `api/functions/DynamicFunctionEngine.js`
- Each function requires:
  - Name, description, parameter schema
  - Implementation method
  - Business context integration

### Personality Engine
- AI responses adapt based on conversation context
- Personality profiles defined in `api/functions/PersonalityEngine.js`
- Track and update user context during conversations:
  ```js
  {
    customerMood: string,
    communicationStyle: string,
    urgencyLevel: string,
    techSavviness: string
  }
  ```

## Development Workflow

1. Setup environment:
   ```bash
   # In /api directory
   cp .env.example .env
   npm install
   # Start ngrok tunnel
   ngrok http 3000
   # Update .env with ngrok URL
   ```

2. Test changes:
   ```bash
   # Run API tests
   cd api && npm test
   # Run bot tests
   cd bot && npm test
   ```

3. Run locally:
   ```bash
   # Start API server
   cd api && npm start
   # Start bot in separate terminal
   cd bot && npm start
   ```

## Critical Files

- `api/functions/DynamicFunctionEngine.js` - Core business logic templates
- `api/functions/PersonalityEngine.js` - Conversation adaptation system
- `api/routes/gpt.js` - AI model integration and response handling
- `bot/commands/*.js` - Telegram command implementations
- `api/routes/stream.js` - Real-time audio processing

## Mini App Development

### Setup Process
```bash
# In /bot/miniapp directory
npx @telegram-apps/create-mini-app@latest
npm install @telegram-apps/sdk
```

### Key Integration Points
1. Use `tma.js` SDK for Telegram client features
2. Port existing bot commands to UI components
3. Maintain seamless backend communication
4. Deploy to Vercel for production hosting

### Features to Implement
- Convert all bot commands to UI flows
- Real-time call monitoring interface
- Interactive transcription viewer
- User management dashboard
- System configuration panels

## Best Practices

1. Always validate Twilio webhooks using the signature middleware:
   ```js
   app.use('/webhook', validateTwilioRequest);
   ```

2. Use event emitters for async flows (see `EnhancedGptService`)

3. Keep conversation context in memory, persist only necessary data to SQLite

4. Test all new function templates with the test suite in `api/test/`

5. When developing Mini App features:
   - Maintain modularity in `/bot/miniapp` directory
   - Follow Telegram WebApp SDK guidelines
   - Test both in Telegram client and development mode
   - Ensure responsive design for various device sizes