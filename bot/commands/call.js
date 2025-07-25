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

                   // Step 1: Confirmation message of call request details
        await ctx.reply(
          `📲 Phone: ${number}\n🏦 Prompt: ${prompt}\n📇 Message: ${first || 'N/A'}`
        );

        // Step 2 & 3: Delayed simulated progression of call status
        const chatId = ctx.chat.id;

        // Delay to simulate calling phase (isolated per chat session)
        setTimeout(() => {
          ctx.api.sendMessage(chatId, '*✅ Calling...*', { parse_mode: 'Markdown' });
        }, 1000);

        // Further delay to simulate ringing phase
        setTimeout(() => {
          ctx.api.sendMessage(chatId, '*☎️ Ringing...*', { parse_mode: 'Markdown' });
        }, 2000);
      } catch (err) {
        // Catch network/API issues and notify
        console.error('❌ API call error:', err.message);
        await ctx.reply('⚠️ Failed to send call request. Please check the service or API.');
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