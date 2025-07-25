// routes/outbound.js (CommonJS version, no external ElevenLabs file)

const WebSocket = require('ws');
const Twilio = require('twilio');
const config = require('../config');

const twilioClient = Twilio(
  config.twilio.accountSid,
  config.twilio.authToken
);

function outboundHandler(fastify, options, done) {
  fastify.post('/outbound-call', async (request, reply) => {
    const { number, prompt, first_message } = request.body;

    if (!number) return reply.code(400).send({ error: 'Phone number is required' });

    try {
      const call = await twilioClient.calls.create({
        from: config.twilio.phoneNumber,
        to: number,
        url: `https://${request.headers.host}/outbound-call-twiml?prompt=${encodeURIComponent(prompt)}&first_message=${encodeURIComponent(first_message)}`
      });

      reply.send({
        success: true,
        message: 'Call initiated',
        callSid: call.sid
      });
    } catch (error) {
      console.error('Error initiating outbound call:', error);
      reply.code(500).send({ error: 'Failed to initiate call' });
    }
  });

  fastify.all('/outbound-call-twiml', async (request, reply) => {
    const prompt = request.query.prompt || '';
    const first_message = request.query.first_message || '';

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
      <Response>
        <Connect>
          <Stream url="wss://${request.headers.host}/outbound-media-stream">
            <Parameter name="prompt" value="${prompt}" />
            <Parameter name="first_message" value="${first_message}" />
          </Stream>
        </Connect>
      </Response>`;

    reply.type('text/xml').send(twiml);
  });

  fastify.register(async function (fastifyInstance) {
    fastifyInstance.get('/outbound-media-stream', { websocket: true }, (ws, req) => {
      let streamSid = null;
      let callSid = null;
      let elevenWs = null;
      let customParams = null;

      async function getSignedUrl() {
        const https = require('https');

        return new Promise((resolve, reject) => {
          const options = {
            hostname: 'api.elevenlabs.io',
            path: `/v1/convai/conversation/get_signed_url?agent_id=${config.elevenlabs.agentId}`,
            method: 'GET',
            headers: {
              'xi-api-key': config.elevenlabs.apiKey
            }
          };

          const req = https.request(options, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
              try {
                const json = JSON.parse(data);
                resolve(json.signed_url);
              } catch (err) {
                reject(err);
              }
            });
          });

          req.on('error', reject);
          req.end();
        });
      }

      const setupEleven = async () => {
        try {
          const signedUrl = await getSignedUrl();
          elevenWs = new WebSocket(signedUrl);

          elevenWs.on('open', () => {
            const init = {
              type: 'conversation_initiation_client_data',
              conversation_config_override: {
                agent: {
                  prompt: { prompt: customParams?.prompt || 'You are a helpful agent.' },
                  first_message: customParams?.first_message || 'Hello, how can I help you?'
                }
              }
            };
            elevenWs.send(JSON.stringify(init));
          });

          elevenWs.on('message', data => {
            try {
              const msg = JSON.parse(data);
              if (msg.audio?.chunk) {
                ws.send(JSON.stringify({ event: 'media', streamSid, media: { payload: msg.audio.chunk } }));
              }
              if (msg.audio_event?.audio_base_64) {
                ws.send(JSON.stringify({ event: 'media', streamSid, media: { payload: msg.audio_event.audio_base_64 } }));
              }
              if (msg.type === 'interruption') {
                ws.send(JSON.stringify({ event: 'clear', streamSid }));
              }
              if (msg.type === 'ping') {
                elevenWs.send(JSON.stringify({ type: 'pong', event_id: msg.ping_event?.event_id }));
              }
            } catch (err) {
              console.error('[ElevenLabs] Invalid JSON:', err);
            }
          });

          elevenWs.on('close', () => console.log('[ElevenLabs] Closed'));
          elevenWs.on('error', err => console.error('[ElevenLabs] Error:', err));

        } catch (err) {
          console.error('[Eleven Setup Failed]', err);
          ws.close();
        }
      };

      setupEleven();

      ws.on('message', message => {
        try {
          const data = JSON.parse(message);
          switch (data.event) {
            case 'start':
              streamSid = data.start.streamSid;
              callSid = data.start.callSid;
              customParams = data.start.customParameters;
              break;
            case 'media':
              if (elevenWs?.readyState === WebSocket.OPEN) {
                elevenWs.send(JSON.stringify({ user_audio_chunk: Buffer.from(data.media.payload, 'base64').toString('base64') }));
              }
              break;
            case 'stop':
              if (elevenWs?.readyState === WebSocket.OPEN) elevenWs.close();
              break;
          }
        } catch (e) {
          console.error('[Twilio WS Error]', e);
        }
      });

      ws.on('close', () => {
        if (elevenWs?.readyState === WebSocket.OPEN) elevenWs.close();
      });
    });
  });

  done();
}

module.exports = outboundHandler;