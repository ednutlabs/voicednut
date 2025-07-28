require('dotenv').config();

const required = [
    'ELEVENLABS_API_KEY',
    'ELEVENLABS_AGENT_ID',
    'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN',
    'TWILIO_PHONE_NUMBER',
    'BOT_TOKEN'
];

for (const key of required) {
    if (!process.env[key]) {
        console.error(`❌ Missing environment variable: ${key}`);
        process.exit(1);
    }
}

module.exports = {
    twilio: {
        accountSid: process.env.TWILIO_ACCOUNT_SID,
        authToken: process.env.TWILIO_AUTH_TOKEN,
        phoneNumber: process.env.TWILIO_PHONE_NUMBER
    },
    elevenlabs: {
        apiKey: process.env.ELEVENLABS_API_KEY,
        agentId: process.env.ELEVENLABS_AGENT_ID,
    },
    server: {
        port: process.env.PORT || 8000
    },
    bot: {
        token: process.env.BOT_TOKEN
    },
    webhook: {
        secret: process.env.WEBHOOK_SECRET
    },
    server: {
        port: process.env.PORT
    },

    setupdone: process.env.SETUPDONE || 'false'
};