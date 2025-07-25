// api/routes/status.js

const axios = require('axios');
const config = require('../config');

module.exports = async function statusRoutes(fastify, options) {
  fastify.post('/status', async (request, reply) => {
    try {
      const body = request.body;
      const callSid = body.CallSid;
      const transcription = body.transcription || '';
      const userChatId = body.user_chat_id || null;

      if (!callSid || !userChatId) {
        return reply.code(400).send({ error: 'Missing callSid or user_chat_id' });
      }

      const summaryMessage = `📞 *Call Summary*

• Call SID: \`${callSid}\`
• Transcription: ${transcription || '_No transcript available_'}
`;

      // Notify the bot
      await axios.post(`${config.botUrl}/api/notify`, {
        chat_id: userChatId,
        text: summaryMessage,
        parse_mode: 'Markdown',
      });

      reply.send({ success: true });
    } catch (error) {
      console.error('Status webhook error:', error);
      reply.code(500).send({ error: 'Failed to process status webhook' });
    }
  });
};