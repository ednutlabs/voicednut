'use strict';

require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const WebSocket = require('ws');
const fs = require('fs');
const fetch = require('node-fetch');
const { Auth } = require('@vonage/auth');
const { Vonage } = require('@vonage/server-sdk');
const { streamTTS } = require('./tts/elevenlabs');
const { togetherAIResponse } = require('./ai/together');
const { logCall, getCall } = require('./db/db');
const { registerStatusHandlers } = require('./status');

const app = express();
app.use(bodyParser.json());

const privateKey = fs.readFileSync('./.private.key');
const credentials = new Auth({
  apiKey: process.env.API_KEY,
  apiSecret: process.env.API_SECRET,
  applicationId: process.env.APP_ID,
  privateKey: './.private.key'
});
const vonage = new Vonage(credentials, { apiHost: `https://${process.env.API_REGION}` });

const processorServer = process.env.PROCESSOR_SERVER;
const vgSocketMap = {};

const server = require('http').createServer(app);
const wss = new WebSocket.Server({ server, path: '/socket' });

wss.on('connection', (ws, req) => {
  const call_uuid = new URLSearchParams(req.url.split('?')[1]).get('call_uuid');
  vgSocketMap[call_uuid] = ws;
  ws.on('close', () => delete vgSocketMap[call_uuid]);
});

//==== Inbound Call ====

app.get('/answer', (req, res) => {
  const uuid = req.query.uuid;
  res.json([
    { action: 'talk', text: 'Connecting your call...', language: 'en-US', style: 11 },
    { action: 'conversation', name: 'conf_' + uuid, startOnEnter: true, endOnExit: true }
  ]);
});

app.post('/event', (req, res) => {
  res.send('OK');
  if (req.body.type === 'transfer') {
    const uuid = req.body.uuid;
    const host = req.hostname;
    const wsUri = `wss://${processorServer}/socket?call_uuid=${uuid}&webhook_url=https://${host}/results`;

    vonage.voice.createOutboundCall({
      to: [{ type: 'websocket', uri: wsUri, 'content-type': 'audio/l16;rate=16000' }],
      from: { type: 'phone', number: process.env.SERVICE_PHONE_NUMBER },
      answer_url: [`https://${host}/ws_answer?uuid=${uuid}`],
      event_url: [`https://${host}/ws_event?uuid=${uuid}`]
    });
  }
});

//==== Outbound Call ====

app.post('/outbound-call', async (req, res) => {
  const { prompt, first_message, number, user_chat_id } = req.body;
  if (!prompt || !first_message || !number) return res.status(400).send('Missing fields');

  const uuid = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const host = req.hostname;

  logCall({ call_uuid: uuid, phone_number: number, prompt, first_message, user_chat_id });

  await vonage.voice.createOutboundCall({
    to: [{ type: 'phone', number }],
    from: { type: 'phone', number: process.env.SERVICE_PHONE_NUMBER },
    answer_url: [`https://${host}/answer_outbound_prompted?call_uuid=${uuid}`],
    event_url: [`https://${host}/webhook/call-status`]
  });

  await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: user_chat_id,
      text: `📞 Calling ${number}...\n\nPrompt: ${prompt}`
    })
  });

  res.send({ message: 'Outbound call initiated', call_uuid: uuid });
});

app.get('/answer_outbound_prompted', (req, res) => {
  const uuid = req.query.call_uuid;
  getCall(uuid, (row) => {
    const first = row?.first_message || 'Connecting you to your voice assistant.';
    res.json([
      { action: 'talk', 
        text: first, 
        language: 'en-US', 
        style: 11 
    },
      {
        action: 'connect',
        endpoint: [{
          type: 'websocket',
          uri: `wss://${processorServer}/socket?call_uuid=${uuid}&webhook_url=https://${req.hostname}/results`,
          'content-type': 'audio/l16;rate=16000'
        }]
      }
    ]);
  });
});

//==== Results (only runs TTS, sends nothing) ====

app.post('/results', async (req, res) => {
  const { call_uuid, transcript } = req.body;
  res.send('ok');

  getCall(call_uuid, async (call) => {
    const prompt = call?.prompt;
    const response = await togetherAIResponse(transcript, prompt);
    const ws = vgSocketMap[call_uuid];
    if (ws) {
      streamTTS({
        text: response,
        onAudioChunk: chunk => ws.send(chunk),
        onEnd: () => console.log(`[TTS] done for ${call_uuid}`)
      });
    }

    // Webhook posts result summary separately
    await fetch(`${process.env.API_BASE}/webhook/call-result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        call_uuid,
        transcript,
        agent_response: response,
        duration: 15
      })
    });
  });
});

//==== System =====

registerStatusHandlers(app);
app.get('/_/health', (_, res) => res.send('ok'));

const PORT = process.env.PORT || 8000;
server.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));