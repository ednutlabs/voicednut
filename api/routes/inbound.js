
const WebSocket = require('ws');
const https = require('https');
const sqlite3 = require('sqlite3').verbose();
const config = require('../config');

module.exports = function (fastify, options, done) {
    fastify.all('/inbound-call', (request, reply) => {
        const phone_number = request.body.From;
        const callSid = request.body.CallSid;

        if (!phone_number || !callSid) {
            return reply.code(400).send('Missing required params');
        }

        const db = new sqlite3.Database('./db/data.db');
        db.run(
            `INSERT OR IGNORE INTO calls (call_sid, phone_number, prompt, first_message, user_chat_id) VALUES (?, ?, ?, ?, ?)`,
            [callSid, phone_number, 'Inbound prompt', '', null],
            function (err) {
                if (err) {
                    console.error('DB insert error:', err.message);
                    return reply.code(500).send('DB error');
                }

                db.run(`UPDATE calls SET status = ? WHERE call_sid = ?`, ['initiated', callSid], function (err) {
                    if (err) {
                        console.error('DB update error:', err.message);
                        return reply.code(500).send('DB update error');
                    }

                    const twiml = `<?xml version="1.0"?>
                    <Response>
                        <Connect>
                            <Stream url="wss://${request.headers.host}/inbound-media-stream">
                                <Parameter name="callSid" value="${callSid}" />
                            </Stream>
                        </Connect>
                    </Response>`;
                    reply.type('text/xml').send(twiml);
                });
            }
        );
    });

    fastify.register(async function (instance) {
        instance.get('/inbound-media-stream', { websocket: true }, (ws, req) => {
            let elevenWs = null;
            let callSid = null;

            function getSignedUrl(cb) {
                const options = {
                    hostname: 'api.elevenlabs.io',
                    path: `/v1/convai/conversation/get_signed_url?agent_id=${config.elevenlabs.agentId}`,
                    headers: { 'xi-api-key': config.elevenlabs.apiKey },
                    method: 'GET'
                };

                const req = https.request(options, (res) => {
                    let raw = '';
                    res.on('data', (chunk) => raw += chunk);
                    res.on('end', () => {
                        try {
                            const json = JSON.parse(raw);
                            cb(null, json.signed_url);
                        } catch (err) {
                            cb(err);
                        }
                    });
                });

                req.on('error', cb);
                req.end();
            }

            ws.on('message', (msg) => {
                try {
                    const event = JSON.parse(msg.toString());

                    if (event.event === 'start') {
                        callSid = event.start.callSid;

                        getSignedUrl((err, signedUrl) => {
                            if (err) return console.error('Signed URL error:', err);

                            elevenWs = new WebSocket(signedUrl);
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

                            elevenWs.on('message', (data) => {
                                try {
                                    const parsed = JSON.parse(data);
                                    if (parsed.audio?.chunk) {
                                        ws.send(JSON.stringify({ event: 'media', media: { payload: parsed.audio.chunk } }));
                                    }
                                } catch (err) {
                                    console.error('Audio parse error:', err);
                                }
                            });

                            elevenWs.on('close', () => {
                                const db = new sqlite3.Database('./api/db/data.db');
                                db.run(`UPDATE calls SET status = ? WHERE call_sid = ?`, ['completed', callSid]);
                            });

                            elevenWs.on('error', (e) => console.error('ElevenWS Error:', e));
                        });
                    }

                    if (event.event === 'media' && elevenWs?.readyState === WebSocket.OPEN) {
                        elevenWs.send(JSON.stringify({ user_audio_chunk: event.media.payload }));
                    }

                    if (event.event === 'stop' && elevenWs?.readyState === WebSocket.OPEN) {
                        elevenWs.close();
                    }

                } catch (err) {
                    console.error('WS message error:', err);
                }
            });

            ws.on('close', () => {
                if (elevenWs?.readyState === WebSocket.OPEN) elevenWs.close();
            });
        });
    });

    done();
};