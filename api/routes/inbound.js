/**
 * Import required dependencies
 */
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const { logCall, updateCallStatus } = require('../db/db');
const config = require('../config');

/**
 * Helper function to get signed URL for authenticated conversations
 */
async function getSignedUrl() {
  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${config.elevenlabs.agentId}`,
      {
        method: 'GET',
        headers: {
          'xi-api-key': config.elevenlabs.apiKey,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get signed URL: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error getting signed URL:', error);
    throw error;
  }
}

/**
 * Inbound call handler setup
 */
function inboundHandler(fastify, options, done) {
  // Route to handle incoming calls from Twilio
  fastify.all('/inbound-call', async (request, reply) => {
    const call_uuid = uuidv4();
    const { From: phone_number, CallSid } = request.body;

    try {
      await logCall({
        call_uuid,
        phone_number,
        prompt: "Inbound call handler",
        first_message: "Hello, how can I help you today?"
      });

      await updateCallStatus(call_uuid, "initiated", CallSid);

      const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
        <Response>
          <Connect>
            <Stream url="wss://${request.headers.host}/media-stream">
              <Parameter name="call_uuid" value="${call_uuid}"/>
            </Stream>
          </Connect>
        </Response>`;

      reply.type('text/xml').send(twimlResponse);
    } catch (error) {
      console.error('Error handling inbound call:', error);
      reply.code(500).send('Error handling call');
    }
  });

  // WebSocket route for handling media streams
  fastify.register(async (fastifyInstance) => {
    fastifyInstance.get('/media-stream', { websocket: true }, (ws, req) => {
      console.info('[Server] Twilio connected to media stream');

      let streamSid = null;
      let callSid = null;
      let elevenLabsWs = null;
      let call_uuid = null;

      // Handle WebSocket errors
      ws.on('error', console.error);

      const setupElevenLabs = async () => {
        try {
          const { signed_url } = await getSignedUrl();
          elevenLabsWs = new WebSocket(signed_url);

          elevenLabsWs.on('open', () => {
            console.log('[ElevenLabs] Connected to Conversational AI');
          });

          elevenLabsWs.on('message', async (data) => {
            try {
              const message = JSON.parse(data);
              handleElevenLabsMessage(message, streamSid, call_uuid, ws);
            } catch (error) {
              console.error('[ElevenLabs] Error processing message:', error);
            }
          });

          elevenLabsWs.on('close', async () => {
            console.log('[ElevenLabs] Disconnected');
            if (call_uuid) {
              await updateCallStatus(call_uuid, 'completed');
            }
          });

        } catch (error) {
          console.error('[ElevenLabs] Setup error:', error);
        }
      };

      setupElevenLabs();

      // Handle messages from Twilio
      ws.on('message', async (message) => {
        try {
          const msg = JSON.parse(message);
          handleTwilioMessage(msg, ws, elevenLabsWs);
        } catch (error) {
          console.error('[Twilio] Error processing message:', error);
        }
      });

      // Handle WebSocket closure
      ws.on('close', async () => {
        console.log('[Twilio] Client disconnected');
        if (call_uuid) {
          await updateCallStatus(call_uuid, 'disconnected');
        }
        if (elevenLabsWs?.readyState === WebSocket.OPEN) {
          elevenLabsWs.close();
        }
      });
    });
  });

  done();
}

module.exports = inboundHandler;