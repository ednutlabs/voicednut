const { InlineKeyboard } = require('grammy');
const config = require('../config');

module.exports = (bot) => {
    bot.command('guide', async (ctx) => {
        const mainGuide = `📚 *Voice Call Bot Guide*

*Making Calls:*
1️⃣ Start a call using /call or the Call button
2️⃣ Enter phone number in E.164 format (+1234567890)
3️⃣ Define the AI agent's behavior/personality
4️⃣ Set the first message to be spoken
5️⃣ Monitor the call progress

*Phone Number Format:*
• Must start with + symbol
• Include country code
• No spaces or special characters
• Example: +1234567890

*Best Practices:*
• Keep agent prompts clear and specific
• Test with short calls first
• Monitor initial responses
• End calls if needed with /end

*Troubleshooting:*
• If call fails, check number format
• Ensure proper authorization
• Contact admin for persistent issues
• Use /status to check bot health

*Need Help?*
Contact: @${config.admin.username} for support.
Version: 1.0.0`;

        const kb = new InlineKeyboard()
            .text('📞 New Call', 'CALL')
            .text('📋 Commands', 'HELP')
            .row()
            .text('💬 New Sms', 'SMS')
            .text('🔄 Main Menu', 'MENU');

        await ctx.reply(mainGuide, {
            parse_mode: 'Markdown',
            reply_markup: kb
        });
    });
};