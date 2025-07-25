// routes/inbound.js
const WebSocket = require('ws');
const https = require('https');
const Twilio = require('twilio');
const config = require('../config');
const { logCall, updateCallStatus } = require('../db/db');

const twilioClient = Twilio(config.twilio.accountSid, config.twilio.authToken);

function inboundHandler(fastify, options, done) {
  fastify.all('/inbound-call', async (request, reply) => {
    const { From: phone_number, CallSid: callSid } = request.body;
    if (!phone_number || !callSid) {
      return reply.code(400).send('Missing required params');
    }
    try {
      await logCall({ call_sid: callSid, phone_number, prompt: 'Inbound prompt', first_message: '', user_chat_id: null });
      await updateCallStatus(callSid, 'initiated');
      const twiml = `<?xml version="1.0"?>
        <Response>
          <Connect>
            <Stream url="wss://${request.headers.host}/inbound-media-stream">
              <Parameter name="callSid" value="${callSid}" />
            </Stream>
          </Connect>
        </Response>`;
      reply.type('text/xml').send(twiml);
    } catch (err) {
      console.error('Inbound error:', err);
      reply.code(500).send('Error handling inbound');
    }
  });

  fastify.register(async function (fastifyInstance) {
    fastifyInstance.get('/inbound-media-stream', { websocket: true }, (ws) => {
      let elevenWs = null;
      let callSid = null;

      async function getSignedUrl() {
        return new Promise((resolve, reject) => {
          const req = https.request({
            hostname: 'api.elevenlabs.io',
            path: `/v1/convai/conversation/get_signed_url?agent_id=${config.elevenlabs.agentId}`,
            headers: { 'xi-api-key': config.elevenlabs.apiKey }
          }, res => {
            let raw = '';
            res.on('data', chunk => raw += chunk);
            res.on('end', () => {
              try { resolve(JSON.parse(raw).signed_url); }
              catch (e) { reject(e); }
            });
          });
          req.on('error', reject);
          req.end();
        });
      }

      ws.on('message', async msg => {
        try {
          const event = JSON.parse(msg.toString());
          if (event.event === 'start') {
            callSid = event.start.callSid;
            const url = await getSignedUrl();
            elevenWs = new WebSocket(url);
            elevenWs.on('open', () => {
              elevenWs.send(JSON.stringify({
                type: 'conversation_initiation_client_data',
                conversation_config_override: {
                  agent: {
                    prompt: 'Inbound prompt',
                    first_message: 'Hi there!'
                  }
                }
              }));
            });
            elevenWs.on('message', data => {
              const m = JSON.parse(data);
              if (m.audio?.chunk) {
                ws.send(JSON.stringify({ event: 'media', media: { payload: m.audio.chunk } }));
              }
            });
            elevenWs.on('error', console.error);
            elevenWs.on('close', () => updateCallStatus(callSid, 'completed'));
          }
          if (event.event === 'media' && elevenWs?.readyState === WebSocket.OPEN) {
            elevenWs.send(JSON.stringify({ user_audio_chunk: event.media.payload }));
          }
          if (event.event === 'stop' && elevenWs?.readyState === WebSocket.OPEN) {
            elevenWs.close();
          }
        } catch (e) {
          console.error('Inbound media error:', e);
        }
      });

      ws.on('close', () => {
        if (elevenWs?.readyState === WebSocket.OPEN) elevenWs.close();
      });
    });
  });

  done();
}

module.exports = inboundHandler;