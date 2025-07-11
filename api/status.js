'use strict';

const fetch = require('node-fetch');
const { getCallByUUID } = require('./db/logger');

async function notifyTelegram(chatId, text, retries = 3) {
  while (retries--) {
    const res = await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text })
    });
    if (res.ok) return;
    await new Promise(r => setTimeout(r, 1000));
  }
}

function registerStatusHandlers(app) {
  app.post('/webhook/call-status', async (req, res) => {
    res.send('ok');
    const { uuid, status } = req.body;
    const call = await new Promise(r => getCallByUUID(uuid, r));
    if (!call) return;

    const chatId = call.user_chat_id || process.env.ADMIN_CHAT_ID;
    const time = new Date().toLocaleTimeString();
    const msg = {
      ringing: `🔔 Ringing... [${time}]`,
      answered: `✅ Answered. [${time}]`,
      completed: `📴 Call completed. [${time}]`
    }[status] || `📟 Status: ${status} [${time}]`;

    await notifyTelegram(chatId, msg);
  });

  app.post('/webhook/call-result', async (req, res) => {
    res.send('ok');
    const { call_uuid, transcript, agent_response, duration } = req.body;
    const call = await new Promise(r => getCallByUUID(call_uuid, r));
    if (!call) return;

    const chatId = call.user_chat_id || process.env.ADMIN_CHAT_ID;
    const summary = `📝 *Call Summary*
🆔 Call UUID: ${call_uuid}
📱 To: ${call.phone_number}
⏱️ Duration: ${duration || 'unknown'} sec
🕓 Time: ${new Date().toLocaleString()}

👤 Customer:
"${transcript}"

🤖 Agent:
"${agent_response}"`;

    await notifyTelegram(chatId, summary);
  });
}

module.exports = { registerStatusHandlers };