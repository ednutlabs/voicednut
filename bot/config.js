require('dotenv').config({debug: true});

const required = [
  'ADMIN_TELEGRAM_ID', 'ADMIN_TELEGRAM_USERNAME', 'API_BASE', 'BOT_TOKEN'
];

for (const key of required) {
  if (!process.env[key]) {
    console.error(`❌ Missing environment variable: ${key}`);
    process.exit(1);
  }
}

module.exports = {
  admin: {
    userId: process.env.ADMIN_TELEGRAM_ID,
    username: process.env.ADMIN_TELEGRAM_USERNAME
  },
  apiUrl: process.env.API_BASE,
  botToken: process.env.BOT_TOKEN
};