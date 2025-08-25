const { getUser, removeUser } = require('../db/db');

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
            const user = await new Promise((resolve, reject) => {
                getUser(ctx.from.id, (err, result) => {
                    if (err) {
                        console.error('Database error in getUser:', err);
                        reject(err);
                    } else {
                        resolve(result);
                    }
                });
            });
            
            if (!user || user.role !== 'ADMIN') {
                await ctx.reply('❌ Admin only.');
                return;
            }
            
            await ctx.conversation.enter("remove-conversation");
        } catch (error) {
            console.error('Remove user command error:', error);
            await ctx.reply('❌ An error occurred. Please try again.');
        }
    });
}

module.exports = { removeUserFlow, registerRemoveUserCommand };