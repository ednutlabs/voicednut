const Fastify = require('fastify');
const { expect } = require('chai');
const statusHandler = require('../routes/status');
const { logCall } = require('../db/db');

// Helper to setup Fastify app for status webhooks
function buildWebhookApp() {
  const app = Fastify();
  app.post('/status/transcription', statusHandler.transcriptionWebhook);
  app.post('/status/audio', statusHandler.audioWebhook);
  return app;
}

describe('Status Webhook Transcription', function () {
  let app;

  before(async function () {
    app = buildWebhookApp();
    await app.ready();
  });

  it('should accept transcription and send message', async function () {
    const call_sid = 'TRANSCRIPT_CALL_001';
    await logCall({
      call_sid,
      phone_number: '+1111222333',
      prompt: 'test prompt',
      first_message: 'test first',
      user_chat_id: 123456
    });

    const response = await app.inject({
      method: 'POST',
      url: '/status/transcription',
      payload: {
        call_sid,
        summary: 'This was a test transcription.',
        full_transcript: 'User said hello. Bot replied hi.',
        metrics: { positive: 5, negative: 0 },
        language: 'en-US',
        topic: 'test call'
      }
    });

    expect(response.statusCode).to.equal(200);
    expect(response.json().success).to.be.true;
  });
});

describe('Status Webhook Audio', function () {
  let app;

  before(async function () {
    app = buildWebhookApp();
    await app.ready();
  });

  it('should accept base64 audio and respond 200', async function () {
    const call_sid = 'AUDIO_CALL_001';
    await logCall({
      call_sid,
      phone_number: '+1444555666',
      prompt: 'prompt test',
      first_message: 'first msg',
      user_chat_id: 654321
    });

    const fakeAudio = Buffer.from('RIFF....').toString('base64');

    const response = await app.inject({
      method: 'POST',
      url: '/status/audio',
      payload: {
        call_sid,
        audio_base64: fakeAudio
      }
    });

    expect(response.statusCode).to.equal(200);
    expect(response.json().success).to.be.true;
  });
});