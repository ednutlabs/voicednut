/**
 * Import required dependencies
 */
const Fastify = require('fastify');
const config = require('./config');
const statusHandler = require('./routes/status');
const inboundHandler = require('./routes/inbound');
const outboundHandler = require('./routes/outbound');

const fastify = Fastify();

// Register plugins
fastify.register(require('@fastify/formbody'));
fastify.register(require('@fastify/websocket'));

// Register routes
fastify.post('/api/status/:call_uuid', statusHandler);
fastify.register(inboundHandler, { prefix: '/api' });
fastify.register(outboundHandler, { prefix: '/api' });

// Start server
const start = async () => {
    try {
        await fastify.listen({ port: config.server.port });
        console.log(`[Server] API listening on port ${config.server.port}`);
    } catch (err) {
        console.error('Error starting server:', err);
        process.exit(1);
    }
};

start();