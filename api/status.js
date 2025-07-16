'use strict';

const axios = require('axios');
const { getCall } = require('./db/db');

async function notifyTelegram(chatId, text, retries = 3) {
    while (retries--) {
        try {
            const response = await axios({
                method: 'POST',
                url: `https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`,
                headers: { 'Content-Type': 'application/json' },
                data: { 
                    chat_id: chatId, 
                    text,
                    parse_mode: 'Markdown'
                }
            });
            if (response.status === 200) return;
            await new Promise(r => setTimeout(r, 1000));
        } catch (error) {
            console.error('Telegram notification error:', error.response?.data || error.message);
            if (retries === 0) throw error;
        }
    }
}

function registerStatusHandlers(app) {
    app.post('/webhook/call-status', async (req, res) => {
        try {
            res.send('ok');
            const { uuid, status } = req.body;
            const call = await getCall(uuid);
            if (!call) return;

            const chatId = call.user_chat_id || process.env.ADMIN_CHAT_ID;
            const time = new Date().toLocaleTimeString();
            const msg = {
                ringing: `🔔 Ringing... [${time}]`,
                answered: `✅ Answered. [${time}]`,
                completed: `📴 Call completed. [${time}]`
            }[status] || `📟 Status: ${status} [${time}]`;

            await notifyTelegram(chatId, msg);
        } catch (error) {
            console.error('Call status webhook error:', error);
        }
    });

    app.post('/webhook/call-result', async (req, res) => {
        try {
            res.send('ok');
            const { call_uuid, transcript, agent_response, duration } = req.body;
            const call = await getCall(call_uuid);
            if (!call) return;

            const chatId = call.user_chat_id || process.env.ADMIN_CHAT_ID;
            const summary = `📝 *Call Summary*
🆔 Call UUID: \`${call_uuid}\`
📱 To: \`${call.phone_number}\`
⏱️ Duration: ${duration || 'unknown'} sec
🕓 Time: ${new Date().toLocaleString()}

👤 *Customer*:
"${transcript}"

🤖 *Agent*:
"${agent_response}"`;

            await notifyTelegram(chatId, summary);
        } catch (error) {
            console.error('Call result webhook error:', error);
        }
    });
}

module.exports = { registerStatusHandlers };