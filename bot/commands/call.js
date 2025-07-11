const { getUser } = require('../db/db');
const fetch = require('node-fetch');

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

        const res = await fetch(`${process.env.API_BASE}/outbound-call`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                number,
                prompt,
                first_message: first,
                user_chat_id: ctx.from.id
            })
        });
        
        const data = await res.json();
        await ctx.reply(res.ok ? 
            `✅ Call initiated! UUID: ${data.call_uuid}` : 
            `❌ Error: ${data.message || 'Unknown error'}`
        );

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