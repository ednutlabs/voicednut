// bot/commands/call.js

const config = require('../config');
const axios = require('axios');

async function callFlow(conversation, ctx) {
    try {
        await ctx.reply('📞 Enter number to call (E.164 format):');
        const numMsg = await conversation.wait();
        const number = numMsg?.message?.text;

        if (!number || !/^\+\d{10,15}$/.test(number)) {
            return ctx.reply('❌ Invalid phone number format. Use format: +1234567890');
        }

        await ctx.reply('✍️ Enter prompt (agent behavior):');
        const promptMsg = await conversation.wait();
        const prompt = promptMsg?.message?.text;

        if (!prompt) {
            return ctx.reply('❌ Please send a valid prompt.');
        }

        await ctx.reply('💬 Enter first message:');
        const firstMsg = await conversation.wait();
        const first = firstMsg?.message?.text;

        if (!first) {
            return ctx.reply('❌ Please send a valid message.');
        }

        const payload = {
            number,
            prompt,
            first_message: first,
            user_chat_id: ctx.from.id
        };

        // Confirm payload to user
        await ctx.reply(`*📤 Calling...*\n\n• Number: ${number}\n• Prompt: ${prompt}\n• First Message: ${first}`);

        // Send call to API
        const response = await axios.post(`${config.apiUrl}/outbound-call`, payload);

        if (!response.data?.callSid) {
            console.error('Missing callSid in response:', response.data);
            return ctx.reply('❌ Call initiation failed. No callSid returned.');
        }

        await ctx.reply(`*☎️ Ringing...*: \`${response.data.callSid}\``, {
            parse_mode: 'Markdown'
        });
        

    } catch (err) {
        console.error('Call flow error:', err?.response?.data || err.message);
        await ctx.reply('❌ Call request failed. Check API or network.');
    }
}

function registerCallCommand(bot) {
    bot.command('call', async (ctx) => {
        try {
            await ctx.conversation.enter("call-conversation");
        } catch (error) {
            console.error('Call command error:', error);
            await ctx.reply('❌ Failed to initiate call conversation.');
        }
    });
}

module.exports = { callFlow, registerCallCommand };