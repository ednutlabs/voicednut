const { InlineKeyboard } = require('grammy');
const { isAdmin, getUser } = require('../db/db');

module.exports = (bot) => {
    // Menu command
    bot.command('menu', async (ctx) => {
        const isOwner = await new Promise(r => isAdmin(ctx.from.id, r));
        
        const kb = new InlineKeyboard()
            .text('📞 Call', 'CALL')
            .text('ℹ️ Help', 'HELP');

        if (isOwner) {
            kb.row()
                .text('➕ Add User', 'ADDUSER')
                .text('⬆️ Promote', 'PROMOTE')
                .text('👥 Users', 'USERS')
                .text('❌ Remove', 'REMOVE');
        }

        await ctx.reply('Select an action:', {
            reply_markup: kb
        });
    });

    // Callback query handlers
    bot.callbackQuery('CALL', async (ctx) => {
        const user = await new Promise(r => getUser(ctx.from.id, r));
        if (!user) {
            await ctx.answerCallbackQuery('❌ You are not authorized.');
            return;
        }
        await ctx.answerCallbackQuery();
        await ctx.conversation.enter("call-conversation");
    });

    bot.callbackQuery('HELP', async (ctx) => {
        await ctx.answerCallbackQuery();
        await ctx.reply(`*Voice Call Bot Help*\n
/start - Start or restart the bot
/call - Start outbound voice call
/adduser - Add user (admin only)
/promote - Promote to ADMIN (admin only)
/removeuser - Remove a USER (admin only)
/users - List authorized users (admin only)
/help - Show this help message
/menu - Show inline command menu`, {
            parse_mode: 'Markdown'
        });
    });

    bot.callbackQuery(['ADDUSER', 'PROMOTE', 'REMOVE', 'USERS'], async (ctx) => {
        const user = await new Promise(r => getUser(ctx.from.id, r));
        if (!user || user.role !== 'ADMIN') {
            await ctx.answerCallbackQuery('❌ Admin only.');
            return;
        }
        
        await ctx.answerCallbackQuery();
        
        switch (ctx.callbackQuery.data) {
            case 'ADDUSER':
                await ctx.conversation.enter("adduser-conversation");
                break;
            case 'PROMOTE':
                await ctx.conversation.enter("promote-conversation");
                break;
            case 'REMOVE':
                await ctx.conversation.enter("remove-conversation");
                break;
            case 'USERS':
                // Let the users command handle this
                await ctx.reply('/users');
                break;
        }
    });

    // Generic handler for unknown callback queries
    bot.on('callback_query:data', async (ctx) => {
        await ctx.answerCallbackQuery({
            text: '❌ Unknown action',
            show_alert: true
        });
    });
};