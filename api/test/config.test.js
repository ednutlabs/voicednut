const { expect } = require('chai');
const config = require('../config');

describe('Config File', function () {
  it('should load all required env values', function () {
    expect(config.twilio.accountSid).to.be.a('string');
    expect(config.twilio.authToken).to.be.a('string');
    expect(config.twilio.phoneNumber).to.be.a('string');
    expect(config.elevenlabs.apiKey).to.be.a('string');
    expect(config.elevenlabs.agentId).to.be.a('string');
    expect(config.bot.token).to.be.a('string');
    expect(config.server.port).to.be.a('number');
  });
});