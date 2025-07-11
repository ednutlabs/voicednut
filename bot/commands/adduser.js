const { getUser, addUser } = require('../db/db');

async function addUserFlow(conversation, ctx) {
    try {
        await ctx.reply('🆔 Enter Telegram ID:');
        const idMsg = await conversation.wait();
        
        if (!idMsg?.message?.text) {
            await ctx.reply('❌ Please send a valid text message.');
            return;
        }

        const id = parseInt(idMsg.message.text);
        if (isNaN(id)) {
            await ctx.reply('❌ Invalid Telegram ID. Please send a number.');
            return;
        }

        await ctx.reply('🔠 Enter username:');
        const usernameMsg = await conversation.wait();
        
        if (!usernameMsg?.message?.text) {
            await ctx.reply('❌ Please send a valid username.');
            return;
        }

        const username = usernameMsg.message.text.trim();
        if (!username) {
            await ctx.reply('❌ Username cannot be empty.');
            return;
        }

        // Convert callback to Promise
        await new Promise((resolve, reject) => {
            addUser(id, username, 'USER', (err) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve();
            });
        });

        // Send success message after awaiting addUser
        await ctx.reply(`✅ @${username} (${id}) added as USER.`);

    } catch (error) {
        console.error('Add user flow error:', error);
        await ctx.reply('❌ An error occurred. Please try again.');
    }
}

function registerAddUserCommand(bot) {
    bot.command(['adduser', 'authorize'], async (ctx) => {
        try {
            const user = await new Promise(r => getUser(ctx.from.id, r));
            if (!user || user.role !== 'ADMIN') {
                return ctx.reply('❌ Admin only.');
            }
            await ctx.conversation.enter("adduser-conversation");
        } catch (error) {
            console.error('Add user command error:', error);
            await ctx.reply('❌ An error occurred. Please try again.');
        }
    });
}

module.exports = { addUserFlow, registerAddUserCommand };