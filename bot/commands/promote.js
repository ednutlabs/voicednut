const { getUser, promoteUser } = require('../db/db');

async function promoteFlow(conversation, ctx) {
    try {
        await ctx.reply('🆔 Enter Telegram ID to promote:');
        const idMsg = await conversation.wait();
        
        if (!idMsg?.message?.text) {
            await ctx.reply('❌ Please send a valid Telegram ID.');
            return;
        }

        const id = parseInt(idMsg.message.text);
        if (isNaN(id)) {
            await ctx.reply('❌ Invalid Telegram ID. Please send a number.');
            return;
        }

        // Convert callback to Promise
        await new Promise((resolve, reject) => {
            promoteUser(id, (err) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve();
            });
        });

        await ctx.reply(`✅ User ${id} promoted to ADMIN.`);

    } catch (error) {
        console.error('Promote flow error:', error);
        await ctx.reply('❌ An error occurred. Please try again.');
    }
}

function registerPromoteCommand(bot) {
    bot.command('promote', async (ctx) => {
        try {
            const user = await new Promise(r => getUser(ctx.from.id, r));
            if (!user || user.role !== 'ADMIN') {
                await ctx.reply('❌ Admin only.');
                return;
            }
            await ctx.conversation.enter("promote-conversation");
        } catch (error) {
            console.error('Promote command error:', error);
            await ctx.reply('❌ An error occurred. Please try again.');
        }
    });
}

module.exports = { promoteFlow, registerPromoteCommand };