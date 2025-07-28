// api/routes/status.js

const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const axios = require('axios');
const config = require('../config');

module.exports = function (fastify, opts, done) {
  fastify.post('/status', async (request, reply) => {
    const secret = config.webhook.secret;
    const rawBody = request.rawBody?.toString() || '';
    const signatureHeader = request.headers['elevenlabs-signature'];

    if (!signatureHeader) {
      return reply.code(400).send({ error: 'Missing signature header' });
    }

    const parts = signatureHeader.split(',');
    const timestamp = parts.find(p => p.startsWith('t=')).split('=')[1];
    const receivedSig = parts.find(p => p.startsWith('v0=')).split('=')[1];

    const age = Date.now() - (parseInt(timestamp) * 1000);
    if (age > 30 * 60 * 1000) {
      return reply.code(403).send({ error: 'Request expired' });
    }

    const computedSig = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${rawBody}`)
      .digest('hex');

    if (receivedSig !== computedSig) {
      return reply.code(401).send({ error: 'Invalid signature' });
    }

    const body = request.body;

    if (body.type !== 'post_call_transcription') {
      return reply.code(204).send();
    }

    const transcript = body.data.transcript;
    const metadata = body.data.metadata;
    const summary = body.data.analysis?.transcript_summary;
    const conversationId = body.data.conversation_id;

    const db = new sqlite3.Database('./db/data.db');

    db.get(
      'SELECT * FROM calls WHERE call_sid = ?',
      [conversationId],
      (err, row) => {
        if (err) {
          console.error('DB error:', err.message);
          return reply.code(500).send({ error: 'DB error' });
        }

        if (!row) {
          return reply.code(404).send({ error: 'Call not found' });
        }

        const chatId = row.user_chat_id;
        if (!chatId) return reply.send({ skipped: true });

        let msg = `📞 *Call Summary*\n\n`;
        msg += `• Call ID: \`${conversationId}\`\n`;
        msg += `• Duration: ${metadata.call_duration_secs}s\n`;
        msg += `• Cost: ${metadata.cost} tokens\n`;
        msg += `• Summary:\n${summary || '_No summary_'}`;

        const botApiUrl = `https://api.telegram.org/bot${config.bot.token}/sendMessage`;

        axios
          .post(botApiUrl, {
            chat_id: chatId,
            text: msg,
            parse_mode: 'Markdown'
          })
          .then(() => {
            return reply.send({ success: true });
          })
          .catch((error) => {
            console.error('Telegram error:', error.message);
            return reply.code(500).send({ error: 'Telegram failed' });
          });
      }
    );
  });

  done();
};