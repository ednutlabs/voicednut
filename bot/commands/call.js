const config = require('../config');
const { getUser } = require('../db/db');
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

        const user_chat_id = ctx.from.id;

        // Send call request to API
        const apiResponse = await axios.post(`${config.apiUrl}/outbound-call`, {
            number,
            prompt,
            first_message: first,
            user_chat_id
        });

        const { data } = apiResponse;

        if (!data?.callSid) {
            throw new Error('CallSid missing in API response');
        }

        await ctx.reply(`📲 Calling initiated!\n\n• Phone: ${number}\n• Prompt: ${prompt}\n• Message: ${first || 'N/A'}`);

        const chatId = ctx.chat.id;

        setTimeout(() => {
            ctx.api.sendMessage(chatId, '*✅ Calling...*', { parse_mode: 'Markdown' });
        }, 1000);

        setTimeout(() => {
            ctx.api.sendMessage(chatId, '*☎️ Ringing...*', { parse_mode: 'Markdown' });
        }, 2000);
    } catch (error) {
        console.error('Call flow error:', error);
        await ctx.reply('❌ Something went wrong. Try again or contact support.');
    }
}

function registerCallCommand(bot) {
    bot.command('call', async (ctx) => {
        try {
            const user = await new Promise(r => getUser(ctx.from.id, r));
            if (!user) {
                return ctx.reply('❌ You are not authorized.');
            }
            await ctx.conversation.enter("call-conversation");
        } catch (error) {
            console.error('Call command error:', error);
            await ctx.reply('❌ An error occurred. Please try again.');
        }
    });
}

module.exports = { callFlow, registerCallCommand };