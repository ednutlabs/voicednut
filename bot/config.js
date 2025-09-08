'use strict';

/*
 * Configuration for the Telegram bot
 */

require('dotenv').config();
const required = [
  'ADMIN_TELEGRAM_ID', 'ADMIN_TELEGRAM_USERNAME', 'API_BASE', 'BOT_TOKEN'
];

// Check for required environment variables

for (const key of required) {
  if (!process.env[key]) {
    console.error(`❌ Missing environment variable: ${key}`);
    process.exit(1);
  }
}

// Check for required environment variables

module.exports = {
  admin: {
    userId: process.env.ADMIN_TELEGRAM_ID,
    username: process.env.ADMIN_TELEGRAM_USERNAME
  },
  apiUrl: process.env.API_BASE,
  botToken: process.env.BOT_TOKEN
},{
  // New Mini App configuration
  webAppUrl: process.env.WEB_APP_URL || 'http://127.0.0.1/miniapp.html',
  webAppSecret: process.env.WEB_APP_SECRET || 'your-web-app-secret',
  webAppPort: process.env.WEB_APP_PORT || 8080,

  // CORS settings for Mini App
  cors: {
    origins: [
      'https://web.telegram.org',
      process.env.WEB_APP_URL || 'http://127.0.0.1:8080'
    ]
  }
};
