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
            
            // Build help text using HTML formatting (more reliable)
            let helpText = `📱 <b>Basic Commands</b>
• /start - Restart bot &amp; show main menu
• /call - Start a new voice call
• /sms - Send an SMS message
• /app - Open web app for advanced actions
• /smsconversation &lt;phone&gt; - View SMS conversation
• /transcript &lt;call_sid&gt; - Get call transcript
• /calls [limit] - List recent calls (max 50)
• /smstemplates - View available SMS templates
• /smstemplate &lt;name&gt; - View specific template
• /health or /ping - Check bot &amp; API health
• /guide - Show detailed usage guide
• /menu - Show quick action buttons
• /help - Show this help message`;

            if (isOwner) {
                helpText += `

👑 <b>Admin Commands</b>
• /adduser - Add new authorized user
• /promote - Promote user to admin
• /removeuser - Remove user access
• /users - List all authorized users
• /bulksms - Send bulk SMS messages
• /schedulesms - Schedule SMS for later
• /smsstats - View SMS statistics
• /status - Full system status check
• /testapi - Test API connection`;
            }

            helpText += `

📖 <b>Quick Usage</b>
1. Use /call or click 📞 Call button
2. Enter phone number (E.164 format: +1234567890)
3. Define agent behavior/prompt
4. Set initial message to be spoken
5. Monitor call progress and receive notifications

💡 <b>Examples</b>
• Phone format: +1234567890 (not 123-456-7890)
• Get transcript: /transcript CA1234567890abcdef
• List calls: /calls 20
• Check health: /health

🆘 <b>Support &amp; Info</b>
• Contact admin: @${config.admin.username}
• Bot version: 2.0.0
• For issues or questions, contact support`;

            const kb = new InlineKeyboard()
                .text('📞 New Call', 'CALL')
                .text('📋 Menu', 'MENU')
                .row()
                .text('💬 New Sms', 'SMS')
                .text('📚 Full Guide', 'GUIDE');

            if (isOwner) {
                kb.row()
                    .text('👥 Users', 'USERS')
                    .text('➕ Add User', 'ADDUSER');
            }

            await ctx.reply(helpText, {
                parse_mode: 'HTML',
                reply_markup: kb
            });

        } catch (error) {
            console.error('Help command error:', error);
            await ctx.reply('❌ Error displaying help. Please try again.');
        }
    });
};
