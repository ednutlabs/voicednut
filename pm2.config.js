module.exports = {
  apps: [
    {
      name: 'api',
      script: 'api.js',
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: 1337
      },
      instances: 1,
      autorestart: true,
      max_memory_restart: '250M'
    },
    {
      name: 'bot',
      script: 'bot/bot.js',
      watch: false,
      env: {
        NODE_ENV: 'production'
      },
      instances: 1,
      autorestart: true,
      max_memory_restart: '200M'
    }
  ]
};