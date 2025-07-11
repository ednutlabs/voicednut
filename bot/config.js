require('dotenv').config({debug: true});

module.exports = {
  admin: {
    userId: process.env.ADMIN_TELEGRAM_ID,
    username: process.env.ADMIN_TELEGRAM_USERNAME
  },
  apiUrl: process.env.API_BASE,
  botToken: process.env.BOT_TOKEN
};