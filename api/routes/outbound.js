// api/routes/outbound.js

const WebSocket = require('ws');
const Twilio = require('twilio');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const config = require('../config');

const dbPath = path.join(__dirname, '../db/data.db');
const twilioClient = Twilio(config.twilio.accountSid, config.twilio.authToken);

function outboundHandler(fastify, opts, done) {
  fastify.post('/outbound-call', async (req, reply) => {
    const { number, prompt, first_message, user_chat_id } = req.body;
    if (!number || !prompt || !first_message || !user_chat_id) {
      return reply.code(400).send({ error: 'Missing required fields' });
    }
    const db = new sqlite3.Database(dbPath);
    try {
      const call = await twilioClient.calls.create({
        from: config.twilio.phoneNumber,
        to: number,
        url: `https://${req.headers.host}/outbound-call-twiml?prompt=${encodeURIComponent(prompt)}&first_message=${encodeURIComponent(first_message)}`
      });
      const call_sid = call.sid;
      db.run(
        `INSERT INTO calls (call_sid, phone_number, prompt, first_message, user_chat_id)
         VALUES (?, ?, ?, ?, ?)`,
        [call_sid, number, prompt, first_message, user_chat_id],
        err => {
          if (err) console.error('DB Insert Error:', err.message);
          db.close();
        }
      );
      reply.send({ success: true, callSid: call_sid });
    } catch (e) {
      console.error('Twilio Call Error:', e);
      reply.code(500).send({ error: 'Failed to initiate call' });
    }
  });

  fastify.all('/outbound-call-twiml', async (req, reply) => {
    const prompt = req.query.prompt || '';
    const first_message = req.query.first_message || '';
    const twiml = `
      <?xml version="1.0" encoding="UTF-8"?>
      <Response>
        <Connect>
          <Stream url="wss://${req.headers.host}/outbound-media-stream">
            <Parameter name="prompt" value="${prompt}"/>
            <Parameter name="first_message" value="${first_message}"/>
          </Stream>
        </Connect>
      </Response>`;
    reply.type('text/xml').send(twiml.trim());
  });

  fastify.register(async inst => {
    inst.get('/outbound-media-stream', { websocket: true }, (twilioWs, req) => {
      let streamSid = null;
      let callSid = null;
      let elevenWs = null;
      let params = {};

      // Get signed URL
      async function getSignedUrl() {
        return new Promise((resolve, reject) => {
          const https = require('https');
          const opts = {
            hostname: 'api.elevenlabs.io',
            path: `/v1/convai/conversation/get_signed_url?agent_id=${config.elevenlabs.agentId}`,
            headers: { 'xi-api-key': config.elevenlabs.apiKey }
          };
          https.get(opts, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
              try { resolve(JSON.parse(data).signed_url); }
              catch (err) { reject(err); }
            });
          }).on('error', reject);
        });
      }

      getSignedUrl()
        .then(url => {
          elevenWs = new WebSocket(url);
          elevenWs.on('open', () => {
            elevenWs.send(JSON.stringify({
              type: 'conversation_initiation_client_data',
              conversation_config_override: {
                agent: {
                  prompt: { prompt: params.prompt },
                  first_message: params.first_message
                }
              }
            }));
          });

          elevenWs.on('message', data => {
            try {
              const msg = JSON.parse(data);
              if (msg.audio_event?.audio_base_64) {
                twilioWs.send(JSON.stringify({ event: 'media', streamSid, media: { payload: msg.audio_event.audio_base64 } }));
              } else if (msg.audio?.chunk) {
                twilioWs.send(JSON.stringify({ event: 'media', streamSid, media: { payload: msg.audio.chunk } }));
              } else if (msg.type === 'ping') {
                elevenWs.send(JSON.stringify({ type: 'pong', event_id: msg.ping_event.event_id }));
              }
            } catch (err) { console.error('[Eleven JSON error]', err); }
          });
        })
        .catch(e => {
          console.error('Failed fetching signed URL:', e);
          twilioWs.close();
        });

      twilioWs.on('message', msg => {
        try {
          const d = JSON.parse(msg);
          if (d.event === 'start') {
            streamSid = d.start.streamSid;
            callSid = d.start.callSid;
            params = d.start.customParameters || {};
          } else if (d.event === 'stop' && elevenWs?.readyState === WebSocket.OPEN) {
            elevenWs.close();
          } else if (d.event === 'media' && elevenWs?.readyState === WebSocket.OPEN) {
            elevenWs.send(JSON.stringify({ user_audio_chunk: Buffer.from(d.media.payload, 'base64').toString('base64') }));
          }
        } catch (err) {
          console.error('[Twilio WS parse error]', err);
        }
      });

      twilioWs.on('close', () => {
        if (elevenWs?.readyState === WebSocket.OPEN) {
          elevenWs.close();
          updateCallStatus(callSid, 'completed');
        }
      });
    });
  });

  done();
}

module.exports = outboundHandler;