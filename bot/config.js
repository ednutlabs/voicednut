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
};