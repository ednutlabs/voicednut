/**
 * Import required dependencies
 */
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const { logCall, updateCallStatus, getCall } = require('../db/db');
const config = require('../config');

// Initialize Twilio client
const twilioClient = require('twilio')(
  config.twilio.accountSid,
  config.twilio.authToken
);

/**
 * Helper function to get signed URL
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

    const data = await response.json();
    return data.signed_url;
  } catch (error) {
    console.error('Error getting signed URL:', error);
    throw error;
  }
}

/**
 * Outbound call handler setup
 */
function outboundHandler(fastify, options, done) {
  // Route to initiate outbound calls
  fastify.post('/outbound-call', async (request, reply) => {
    const { number, prompt, first_message, user_chat_id } = request.body;

    if (!number) {
      return reply.code(400).send({ error: 'Phone number is required' });
    }

    try {
      const call_uuid = uuidv4();

      await logCall({
        call_uuid,
        phone_number: number,
        prompt,
        first_message,
        user_chat_id
      });

      const call = await twilioClient.calls.create({
        from: config.twilio.phoneNumber,
        to: number,
        url: `https://${request.headers.host}/api/outbound-call-twiml?call_uuid=${call_uuid}`
      });

      await updateCallStatus(call_uuid, 'initiated', call.sid);

      reply.send({
        success: true,
        message: 'Call initiated',
        call_uuid,
        call_sid: call.sid
      });
    } catch (error) {
      console.error('Error initiating outbound call:', error);
      reply.code(500).send({
        success: false,
        error: 'Failed to initiate call'
      });
    }
  });

  // TwiML route for outbound calls
  fastify.all('/outbound-call-twiml', async (request, reply) => {
    const call_uuid = request.query.call_uuid;
    
    try {
      const call = await getCall(call_uuid);
      if (!call) {
        throw new Error('Call not found');
      }

      const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
        <Response>
          <Connect>
            <Stream url="wss://${request.headers.host}/outbound-media-stream">
              <Parameter name="call_uuid" value="${call_uuid}" />
              <Parameter name="prompt" value="${call.prompt}" />
              <Parameter name="first_message" value="${call.first_message}" />
            </Stream>
          </Connect>
        </Response>`;

      reply.type('text/xml').send(twimlResponse);
    } catch (error) {
      console.error('Error generating TwiML:', error);
      reply.code(500).send('Error generating call response');
    }
  });

  // WebSocket handler for outbound media streams
  fastify.register(async (fastifyInstance) => {
    fastifyInstance.get('/outbound-media-stream', { websocket: true }, (ws, req) => {
      console.info('[Server] Connected to outbound media stream');

      let streamSid = null;
      let callSid = null;
      let elevenLabsWs = null;
      let call_uuid = null;

      const setupElevenLabs = async (customParameters) => {
        try {
          const signedUrl = await getSignedUrl();
          elevenLabsWs = new WebSocket(signedUrl);

          elevenLabsWs.on('open', () => {
            console.log('[ElevenLabs] Connected to Conversational AI');
            
            const initialConfig = {
              type: 'conversation_initiation_client_data',
              conversation_config_override: {
                agent: {
                  prompt: {
                    prompt: customParameters?.prompt || 'Default prompt'
                  },
                  first_message: customParameters?.first_message || 'Hello, how can I help you?'
                }
              }
            };

            elevenLabsWs.send(JSON.stringify(initialConfig));
          });

          elevenLabsWs.on('message', handleElevenLabsMessage.bind(null, ws, streamSid, call_uuid));
          elevenLabsWs.on('close', handleElevenLabsClose.bind(null, call_uuid));

        } catch (error) {
          console.error('[ElevenLabs] Setup error:', error);
        }
      };

      ws.on('message', handleTwilioMessage.bind(null, ws, elevenLabsWs, setupElevenLabs));
      ws.on('close', handleWebSocketClose.bind(null, call_uuid, elevenLabsWs));
    });
  });

  done();
}

module.exports = outboundHandler;