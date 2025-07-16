const config = require('../config');
const { getUser } = require('../db/db');
const axios = require('axios');

async function callFlow(conversation, ctx) {
    try {
        await ctx.reply('📞 Enter number to call (E.164 format):');
        const numMsg = await conversation.wait();
        
        if (!numMsg?.message?.text) {
            await ctx.reply('❌ Please send a valid phone number.');
            return;
        }

        const number = numMsg.message.text;
        if (!/^\+\d{10,15}$/.test(number)) {
            await ctx.reply('❌ Invalid phone number format. Use format: +1234567890');
            return;
        }

        await ctx.reply('✍️ Enter prompt (agent behavior):');
        const promptMsg = await conversation.wait();
        
        if (!promptMsg?.message?.text) {
            await ctx.reply('❌ Please send a valid prompt.');
            return;
        }
        const prompt = promptMsg.message.text;

        await ctx.reply('💬 Enter first message:');
        const firstMsg = await conversation.wait();
        
        if (!firstMsg?.message?.text) {
            await ctx.reply('❌ Please send a valid message.');
            return;
        }
        const first = firstMsg.message.text;

        try {
            const response = await axios({
                method: 'POST',
                url: `${config.apiUrl}/outbound-call`,
                headers: { 'Content-Type': 'application/json' },
                data: {
                    number,
                    prompt,
                    first_message: first,
                    user_chat_id: ctx.from.id
                }
            });

            await ctx.reply(`✅ Call initiated! UUID: ${response.data.call_uuid}`);
        } catch (apiError) {
            console.error('API Error:', apiError.response?.data || apiError.message);
            await ctx.reply(`❌ Error: ${apiError.response?.data?.message || 'Failed to initiate call'}`);
        }

    } catch (error) {
        console.error('Call flow error:', error);
        await ctx.reply('❌ An error occurred. Please try again.');
    }
}

function registerCallCommand(bot) {
    bot.command('call', async (ctx) => {
        try {
            const user = await new Promise(r => getUser(ctx.from.id, r));
            if (!user) {
                await ctx.reply('❌ You are not authorized.');
                return;
            }
            await ctx.conversation.enter("call-conversation");
        } catch (error) {
            console.error('Call command error:', error);
            await ctx.reply('❌ An error occurred. Please try again.');
        }
    });
}

module.exports = { callFlow, registerCallCommand };