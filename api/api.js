// api/api.js

const Fastify = require('fastify');
const formBody = require('@fastify/formbody');
const websocket = require('@fastify/websocket');
const dotenv = require('dotenv');
const config = require('./config');

// Load .env
dotenv.config();

// Create server
const fastify = Fastify({ logger: true });
fastify.register(formBody);
fastify.register(websocket);

// Register routes
fastify.register(require('./routes/inbound'));
fastify.register(require('./routes/outbound'));
fastify.register(require('./routes/status'));

// Start server
const PORT = config.port || 1337;
fastify.listen({ port: PORT, host: '0.0.0.0' }, (err, address) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  fastify.log.info(`🚀 Server listening at ${address}`);
});