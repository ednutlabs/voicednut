const { InlineKeyboard } = require('grammy');
const { isAdmin } = require('../db/db');
const config = require('../config');

module.exports = (bot) => {
    bot.command('help', async (ctx) => {
        const isOwner = await new Promise(r => isAdmin(ctx.from.id, r));
        
        const basicCommands = `📱 *Basic Commands*
• /start - Restart bot & show main menu
• /call - Start a new voice call
• /menu - Show quick action buttons
• /help - Show this help message\n`;

        const adminCommands = `\n👑 *Admin Commands*
• /adduser - Add new authorized user
• /promote - Promote user to admin
• /removeuser - Remove user access
• /users - List all authorized users\n`;

        const usageGuide = `\n📖 *Quick Guide*
1. Use /call or click 📞 Call button
2. Enter phone number (E.164 format)
3. Define agent behavior/prompt
4. Set initial message
5. Wait for call to connect\n`;

        const supportInfo = `\n💡 *Support*
• Format numbers as: +1234567890
• Contact: @${config.admin.username} for help
• Version: 1.0.0`;

        const kb = new InlineKeyboard()
            .text('📞 New Call', 'CALL')
            .text('📋 Menu', 'MENU');

        if (isOwner) {
            kb.row()
                .text('👥 Users', 'USERS')
                .text('➕ Add User', 'ADDUSER');
        }

        await ctx.reply(
            basicCommands +
            (isOwner ? adminCommands : '') +
            usageGuide +
            supportInfo,
            {
                parse_mode: 'Markdown',
                reply_markup: kb
            }
        );
    });

    // Add help section command
    bot.command('guide', async (ctx) => {
        const helpText = `🎯 *Detailed Usage Guide*

*Making a Call:*
1. Start with /call command
2. Enter phone number in E.164 format
   Example: +1234567890
3. Define the AI agent's behavior
4. Set the first message to be said

*Phone Number Format:*
• Must start with +
• Include country code
• No spaces or special characters
• Example: +1234567890

*Best Practices:*
• Keep prompts clear and specific
• Test with short calls first
• Monitor call progress

*Need Help?*
Contact admin: @${config.admin.username}`;

        await ctx.reply(helpText, {
            parse_mode: 'Markdown'
        });
    });
};