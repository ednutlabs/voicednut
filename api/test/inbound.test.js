const chai = require('chai');
const chaiHttp = require('chai-http');
const Fastify = require('fastify');
const inboundHandler = require('../routes/inbound');
const { getCall } = require('../db/db');

const expect = chai.expect;
chai.use(chaiHttp);

describe('Inbound Call Route', function () {
  let app;

  before(async function () {
    app = Fastify();
    app.register(require('@fastify/formbody'));
    app.register(inboundHandler);
    await app.ready();
  });

  it('should respond with TwiML and store the call data', async function () {
    const payload = {
      From: '+1234567890',
      CallSid: 'INBOUND123MOCHA'
    };

    const response = await app.inject({
      method: 'POST',
      url: '/inbound-call',
      payload
    });

    expect(response.statusCode).to.equal(200);
    expect(response.headers['content-type']).to.match(/xml/);
    expect(response.body).to.include('<Connect>');

    const call = await getCall('INBOUND123MOCHA');
    expect(call).to.be.an('object');
    expect(call.phone_number).to.equal('+1234567890');
    expect(call.status).to.equal('initiated');
  });
});