require('dotenv').config();

const required = [
  'API_KEY', 'API_SECRET', 'APP_ID', 'SERVICE_PHONE_NUMBER',
  'API_REGION', 'ELEVENLABS_API_KEY', 'ELEVENLABS_AGENT_ID',
  'ELEVENLABS_VOICE_ID', 'PROCESSOR_SERVER', 'BOT_TOKEN'
];

for (const key of required) {
  if (!process.env[key]) {
    console.error(`❌ Missing environment variable: ${key}`);
    process.exit(1);
  }
}

module.exports = {
  vonage: {
    apiKey: process.env.API_KEY,
    apiSecret: process.env.API_SECRET,
    applicationId: process.env.APP_ID,
    privateKeyPath: './.private.key',
    region: process.env.API_REGION,
    serviceNumber: process.env.SERVICE_PHONE_NUMBER,
    recordCalls: process.env.RECORD_CALLS === 'true',
    maxDuration: process.env.MAX_CALL_DURATION || 300
  },
  elevenlabs: {
    apiKey: process.env.ELEVENLABS_API_KEY,
    agentId: process.env.ELEVENLABS_AGENT_ID,
    voiceId: process.env.ELEVENLABS_VOICE_ID,
    model: process.env.ELEVENLABS_MODEL,
    recordAudio: process.env.RECORD_ALL_AUDIO === 'true'
  },
  server: {
    processorHost: process.env.PROCESSOR_SERVER,
    port: process.env.PORT || 7000
  },
  telegram: {
    botToken: process.env.BOT_TOKEN
  }
};