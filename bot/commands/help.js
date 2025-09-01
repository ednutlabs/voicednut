const { InlineKeyboard } = require('grammy');
const { isAdmin, getUser } = require('../db/db');
const config = require('../config');

module.exports = (bot) => {
    bot.command('help', async (ctx) => {
        try {
            // Check if user is authorized
            const user = await new Promise(r => getUser(ctx.from.id, r));
            if (!user) {
                return ctx.reply('❌ You are not authorized to use this bot.');
            }

            const isOwner = await new Promise(r => isAdmin(ctx.from.id, r));
            
            const basicCommands = `📱 *Basic Commands*
• /start - Restart bot & show main menu
• /call - Start a new voice call
• /transcript <call_sid> - Get call transcript
• /calls [limit] - List recent calls (max 50)
• /health or /ping - Check bot & API health
• /guide - Show detailed usage guide
• /menu - Show quick action buttons
• /help - Show this help message\n`;

            const adminCommands = `\n👑 *Admin Commands*
• /adduser - Add new authorized user
• /promote - Promote user to admin
• /removeuser - Remove user access
• /users - List all authorized users
• /status - Full system status check
• /test_api - Test API connection\n`;

            const usageGuide = `\n📖 *Quick Usage*
1. Use /call or click 📞 Call button
2. Enter phone number (E.164 format: +1234567890)
3. Define agent behavior/prompt
4. Set initial message to be spoken
5. Monitor call progress and receive notifications\n`;

            const examples = `\n💡 *Examples*
• Phone format: +1234567890 (not 123-456-7890)
• Get transcript: /transcript CA1234567890abcdef
• List calls: /calls 20
• Check health: /health\n`;

            const supportInfo = `\n🆘 *Support & Info*
• Contact admin: @${config.admin.username}
• Bot version: 2.0.0
• For issues or questions, contact support`;

            const kb = new InlineKeyboard()
                .text('📞 New Call', 'CALL')
                .text('📋 Menu', 'MENU')
                .row()
                .text('📚 Full Guide', 'GUIDE');

            if (isOwner) {
                kb.row()
                    .text('👥 Users', 'USERS')
                    .text('➕ Add User', 'ADDUSER');
            }

            await ctx.reply(
                basicCommands +
                (isOwner ? adminCommands : '') +
                usageGuide +
                examples +
                supportInfo,
                {
                    parse_mode: 'Markdown',
                    reply_markup: kb
                }
            );
        } catch (error) {
            console.error('Help command error:', error);
            await ctx.reply('❌ Error displaying help. Please try again.');
        }
    });
};
