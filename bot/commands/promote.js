const { getUser, promoteUser, isAdmin } = require('../db/db');

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

        // Convert callback to Promise with proper error handling
        await new Promise((resolve, reject) => {
            promoteUser(id, (err) => {
                if (err) {
                    console.error('Database error in promoteUser:', err);
                    reject(err);
                    return;
                }
                resolve();
            });
        });

        await ctx.reply(`✅ User ${id} promoted to ADMIN.`);

    } catch (error) {
        console.error('Promote flow error:', error);
        await ctx.reply('❌ An error occurred while promoting user. Please try again.');
    }
}

function registerPromoteCommand(bot) {
    bot.command('promote', async (ctx) => {
        try {
                       // Check if user is authorized and is admin
            const user = await new Promise(r => getUser(ctx.from.id, r));
            if (!user) {
                return ctx.reply('❌ You are not authorized to use this bot.');
            }

            const adminStatus = await new Promise(r => isAdmin(ctx.from.id, r));
            if (!adminStatus) {
                return ctx.reply('❌ This command is for administrators only.');
            }
            
            await ctx.conversation.enter("promote-conversation");
        } catch (error) {
            console.error('Promote command error:', error);
            await ctx.reply('❌ An error occurred. Please try again.');
        }
    });
}

module.exports = { promoteFlow, registerPromoteCommand };
