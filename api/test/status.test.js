const Fastify = require('fastify');
const { expect } = require('chai');
const statusHandler = require('../routes/status');
const { logCall } = require('../db/db');

describe('POST /status', function () {
  let app;

  before(async function () {
    app = Fastify();
    app.post('/status/:call_sid', statusHandler.statusHandler);
    await app.ready();
  });

  it('should update call status and return success', async function () {
    const call_sid = 'MOCHA_STATUS_SID';
    await logCall({
      call_sid,
      phone_number: '+1234567890',
      prompt: 'Prompt',
      first_message: 'Msg',
      user_chat_id: 9876
    });

    const response = await app.inject({
      method: 'POST',
      url: `/status/${call_sid}`,
      payload: {
        CallSid: call_sid,
        status: 'completed'
      }
    });

    const res = JSON.parse(response.body);
    expect(response.statusCode).to.equal(200);
    expect(res.success).to.be.true;
    expect(res.status).to.equal('completed');
  });
});