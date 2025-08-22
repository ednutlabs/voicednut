const { InlineKeyboard } = require('grammy');
const { checkUserAuthorization, checkAdminStatus, handleCommandError } = require('../utils/helpers');

module.exports = (bot) => {
    // Menu command
    bot.command('menu', async (ctx) => {
        try {
            const user = await checkUserAuthorization(ctx.from.id);
            if (!user) {
                return ctx.reply('❌ You are not authorized to use this bot.');
            }

            const isOwner = await checkAdminStatus(ctx.from.id);
            
            const kb = new InlineKeyboard()
                .text('📞 New Call', 'CALL')
                .text('📋 Recent Calls', 'CALLS')
                .row()
                .text('🏥 Health Check', 'HEALTH')
                .text('ℹ️ Help', 'HELP')
                .row()
                .text('📚 Guide', 'GUIDE');

            if (isOwner) {
                kb.row()
                    .text('➕ Add User', 'ADDUSER')
                    .text('⬆️ Promote', 'PROMOTE')
                    .row()
                    .text('👥 Users', 'USERS')
                    .text('❌ Remove', 'REMOVE')
                    .row()
                    .text('🔍 Status', 'STATUS')
                    .text('🧪 Test API', 'TEST_API');
            }

            const menuText = isOwner ? 
                '🛡️ *Administrator Menu*\n\nSelect an action below:' :
                '📋 *Quick Actions Menu*\n\nSelect an action below:';

            await ctx.reply(menuText, {
                parse_mode: 'Markdown',
                reply_markup: kb
            });
        } catch (error) {
            await handleCommandError(ctx, error, 'menu display');
        }
    });

    // Enhanced callback handlers
    bot.callbackQuery('CALLS', async (ctx) => {
        try {
            await ctx.answerCallbackQuery();
            const user = await checkUserAuthorization(ctx.from.id);
            if (!user) {
                return ctx.reply('❌ You are not authorized to use this bot.');
            }
            
            // Simulate the calls command
            ctx.message = { text: '/calls 10' };
            await ctx.reply('📋 Fetching recent calls...');
        } catch (error) {
            await handleCommandError(ctx, error, 'calls list');
        }
    });

    bot.callbackQuery('HEALTH', async (ctx) => {
        try {
            await ctx.answerCallbackQuery();
            const user = await checkUserAuthorization(ctx.from.id);
            if (!user) {
                return ctx.reply('❌ You are not authorized to use this bot.');
            }
            
            // Simulate the health command
            ctx.message = { text: '/health' };
            await ctx.reply('🏥 Checking system health...');
        } catch (error) {
            await handleCommandError(ctx, error, 'health check');
        }
    });

    bot.callbackQuery('STATUS', async (ctx) => {
        try {
            await ctx.answerCallbackQuery();
            const isOwner = await checkAdminStatus(ctx.from.id);
            if (!isOwner) {
                return ctx.reply('❌ This action is for administrators only.');
            }
            
            // Simulate the status command
            ctx.message = { text: '/status' };
            await ctx.reply('🔍 Checking full system status...');
        } catch (error) {
            await handleCommandError(ctx, error, 'status check');
        }
    });

    bot.callbackQuery('TEST_API', async (ctx) => {
        try {
            await ctx.answerCallbackQuery();
            const isOwner = await checkAdminStatus(ctx.from.id);
            if (!isOwner) {
                return ctx.reply('❌ This action is for administrators only.');
            }
            
            // Simulate the test_api command
            ctx.message = { text: '/test_api' };
            await ctx.reply('🧪 Testing API connection...');
        } catch (error) {
            await handleCommandError(ctx, error, 'API test');
        }
    });
};