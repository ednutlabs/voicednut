const { getUser, removeUser, isAdmin } = require('../db/db');

async function removeUserFlow(conversation, ctx) {
    try {
        await ctx.reply('🆔 Enter Telegram ID to remove:');
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
            removeUser(id, (err) => {
                if (err) {
                    console.error('Database error in removeUser:', err);
                    reject(err);
                    return;
                }
                resolve();
            });
        });

        await ctx.reply(`✅ User ${id} removed.`);

    } catch (error) {
        console.error('Remove user flow error:', error);
        await ctx.reply('❌ An error occurred while removing user. Please try again.');
    }
}

function registerRemoveUserCommand(bot) {
    bot.command('removeuser', async (ctx) => {
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
            
            await ctx.conversation.enter("remove-conversation");
        } catch (error) {
            console.error('Remove user command error:', error);
            await ctx.reply('❌ An error occurred. Please try again.');
        }
    });
}

module.exports = { removeUserFlow, registerRemoveUserCommand };
