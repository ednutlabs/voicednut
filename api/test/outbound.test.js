const chai = require('chai');
const Fastify = require('fastify');
const sinon = require('sinon');
const chaiHttp = require('chai-http');
const outboundHandler = require('../routes/outbound');
const config = require('../config');
const twilio = require('twilio');

const expect = chai.expect;
chai.use(chaiHttp);

describe('Outbound Call Route', function () {
  let app;
  let twilioStub;

  before(async function () {
    app = Fastify();
    app.register(require('@fastify/formbody'));
    app.register(require('@fastify/websocket'));
    app.register(outboundHandler);
    await app.ready();

    // Stub Twilio call
    twilioStub = sinon.stub(
      twilio(config.twilio.accountSid, config.twilio.authToken).calls,
      'create'
    ).resolves({ sid: 'MOCK_CALL_SID' });
  });

  after(() => twilioStub.restore());

  it('should initiate outbound call and return sid', async function () {
    const payload = {
      number: '+1234567890',
      prompt: 'Test Prompt',
      first_message: 'Hi',
      user_chat_id: 111
    };

    const response = await app.inject({
      method: 'POST',
      url: '/outbound-call',
      payload
    });

    const res = JSON.parse(response.body);
    expect(response.statusCode).to.equal(200);
    expect(res.success).to.be.true;
    expect(res.call_sid).to.equal('MOCK_CALL_SID');
  });
});