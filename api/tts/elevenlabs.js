'use strict';
require('dotenv').config();
const WebSocket = require('ws');

const API_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID;

function streamTTS({ text, onAudioChunk, onEnd }) {
  const ws = new WebSocket(`wss://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/stream`, {
    headers: { 'xi-api-key': API_KEY }
  });

  ws.on('open', () => {
    ws.send(JSON.stringify({
      text,
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75
      }
    }));
  });

  ws.on('message', data => {
    const msg = JSON.parse(data.toString());
    if (msg.audio) onAudioChunk(Buffer.from(msg.audio, 'base64'));
    if (msg.isFinal && onEnd) onEnd();
  });

  ws.on('error', console.error);
  ws.on('close', () => console.log('[11Labs WS closed]'));
}

module.exports = { streamTTS };