const express = require('express');
const request = require('supertest');

// Set a test Twilio auth token
process.env.TWILIO_AUTH_TOKEN = 'test_auth_token';

const twilio = require('twilio');
const validateTwilioRequest = require('../middleware/twilioSignature')();

describe('Twilio signature middleware', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.urlencoded({ extended: false }));
    app.post('/webhook', validateTwilioRequest, (req, res) => res.status(200).send('ok'));
  });

  test('allows valid request', async () => {
    const url = 'https://example.com/webhook';
    const params = { CallSid: 'CA123', CallStatus: 'completed' };
    const signature = twilio.getExpectedTwilioSignature(process.env.TWILIO_AUTH_TOKEN, url, params);

    const res = await request(app)
      .post('/webhook')
      .set('x-twilio-signature', signature)
      .send(params);

    expect(res.status).toBe(200);
    expect(res.text).toBe('ok');
  });

  test('rejects invalid request', async () => {
    const res = await request(app)
      .post('/webhook')
      .set('x-twilio-signature', 'invalidsig')
      .send({});

    expect(res.status).toBe(403);
  });
});
