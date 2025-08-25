const { Bot, session, InlineKeyboard } = require('grammy');
const { conversations, createConversation } = require('@grammyjs/conversations');
const config = require('./config');

// Bot initialization
const token = config.botToken;
const bot = new Bot(token);

// Initialize conversations with error handling wrapper
function wrapConversation(handler, name) {
    return createConversation(async (conversation, ctx) => {
        try {
            await handler(conversation, ctx);
        } catch (error) {
            console.error(`Conversation error in ${name}:`, error);
            await ctx.reply('❌ An error occurred during the conversation. Please try again.');
        }
    }, name);
}

// IMPORTANT: Add session middleware BEFORE conversations
bot.use(session({ initial: () => ({}) }));

// Initialize conversations middleware AFTER session
bot.use(conversations());

// Global error handler
bot.catch((err) => {
    const errorMessage = `Error while handling update ${err.ctx.update.update_id}:
    ${err.error.message}
    Stack: ${err.error.stack}`;
    console.error(errorMessage);
    
    try {
        err.ctx.reply('❌ An error occurred. Please try again or contact support.');
    } catch (replyError) {
        console.error('Failed to send error message:', replyError);
    }
});

// Import dependencies
const { getUser, isAdmin, expireInactiveUsers } = require('./db/db');
const { callFlow, registerCallCommand } = require('./commands/call');
const { addUserFlow, registerAddUserCommand } = require('./commands/adduser');
const { promoteFlow, registerPromoteCommand } = require('./commands/promote');
const { removeUserFlow, registerRemoveUserCommand } = require('./commands/removeuser');

// Register conversations with error handling
bot.use(wrapConversation(callFlow, "call-conversation"));
bot.use(wrapConversation(addUserFlow, "adduser-conversation"));
bot.use(wrapConversation(promoteFlow, "promote-conversation"));
bot.use(wrapConversation(removeUserFlow, "remove-conversation"));

// Register command handlers
registerCallCommand(bot);
registerAddUserCommand(bot);
registerPromoteCommand(bot);
registerRemoveUserCommand(bot);

// Register non-conversation commands
require('./commands/users')(bot);
require('./commands/help')(bot);
require('./commands/menu')(bot);
require('./commands/guide')(bot);
require('./commands/transcript')(bot);
require('./commands/api')(bot);

// Start command handler
bot.command('start', async (ctx) => {
    try {
        expireInactiveUsers();
        
        let user = await new Promise(r => getUser(ctx.from.id, r));
        if (!user) {
            const kb = new InlineKeyboard()
                .text('📱 Contact Admin', `https://t.me/@${config.admin.username}`);
            
            return ctx.reply('*Access Restricted* ⚠️\n\n' +
                'This bot requires authorization.\n' +
                'Please contact an administrator to get access.', {
                parse_mode: 'Markdown',
                reply_markup: kb
            });
        }

        const isOwner = await new Promise(r => isAdmin(ctx.from.id, r));
        
        // Prepare user information
        const userStats = `👤 *User Information*
• ID: \`${ctx.from.id}\`
• Username: @${ctx.from.username || 'none'}
• Role: ${user.role}
• Joined: ${new Date(user.timestamp).toLocaleDateString()}`;

        const welcomeText = isOwner ? 
            '🛡️ *Welcome, Administrator!*\n\nYou have full access to all bot features.' :
            '👋 *Welcome to Voice Call Bot!*\n\nYou can make voice calls using AI agents.';

        // Prepare keyboard
        const kb = new InlineKeyboard()
            .text('📞 New Call', 'CALL')
            .text('📚 Guide', 'GUIDE')
            .row()
            .text('❔ Help', 'HELP')
            .text('📋 Menu', 'MENU');

        if (isOwner) {
            kb.row()
                .text('➕ Add User', 'ADDUSER')
                .text('⬆️ Promote', 'PROMOTE')
                .row()
                .text('👥 Users', 'USERS')
                .text('❌ Remove', 'REMOVE');
        }

        await ctx.reply(`${welcomeText}\n\n${userStats}\n\n` +
            'Use the buttons below or type /help for available commands.', {
            parse_mode: 'Markdown',
            reply_markup: kb
        });
    } catch (error) {
        console.error('Start command error:', error);
        await ctx.reply('❌ An error occurred. Please try again or contact support.');
    }
});

// Enhanced callback query handler
bot.on('callback_query:data', async (ctx) => {
    try {
        // Answer callback query immediately to prevent timeout
        await ctx.answerCallbackQuery();

        const action = ctx.callbackQuery.data;
        console.log(`Callback query received: ${action} from user ${ctx.from.id}`);

        // Verify user authorization
        const user = await new Promise(r => getUser(ctx.from.id, r));
        if (!user) {
            await ctx.reply("❌ You are not authorized to use this bot.");
            return;
        }

        // Check admin permissions
        const isAdminUser = user.role === 'ADMIN';
        const adminActions = ['ADDUSER', 'PROMOTE', 'REMOVE', 'USERS', 'STATUS', 'TEST_API'];
        
        if (adminActions.includes(action) && !isAdminUser) {
            await ctx.reply("❌ This action is for administrators only.");
            return;
        }

        // Handle conversation actions
        const conversations = {
            'CALL': 'call-conversation',
            'ADDUSER': 'adduser-conversation',
            'PROMOTE': 'promote-conversation',
            'REMOVE': 'remove-conversation'
        };

        if (conversations[action]) {
            console.log(`Starting conversation: ${conversations[action]}`);
            await ctx.reply(`Starting ${action.toLowerCase()} process...`);
            await ctx.conversation.enter(conversations[action]);
            return;
        }

        // Handle direct command actions
        switch (action) {
            case 'HELP':
                await executeHelpCommand(ctx, isAdminUser);
                break;
                
            case 'USERS':
                if (isAdminUser) {
                    await executeUsersCommand(ctx);
                }
                break;
                
            case 'GUIDE':
                await executeGuideCommand(ctx);
                break;
                
            case 'MENU':
                await executeMenuCommand(ctx, isAdminUser);
                break;
                
            case 'HEALTH':
                await executeHealthCommand(ctx);
                break;
                
            case 'STATUS':
                if (isAdminUser) {
                    await executeStatusCommand(ctx);
                }
                break;
                
            case 'TEST_API':
                if (isAdminUser) {
                    await executeTestApiCommand(ctx);
                }
                break;
                
            case 'CALLS':
                await executeCallsCommand(ctx);
                break;
                
            default:
                console.log(`Unknown callback action: ${action}`);
                await ctx.reply("❌ Unknown action. Please try again.");
        }

    } catch (error) {
        console.error('Callback query error:', error);
        await ctx.reply("❌ An error occurred processing your request. Please try again.");
    }
});

// Command execution functions for inline buttons
async function executeHelpCommand(ctx, isAdminUser) {
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

    if (isAdminUser) {
        kb.row()
            .text('👥 Users', 'USERS')
            .text('➕ Add User', 'ADDUSER');
    }

    await ctx.reply(
        basicCommands +
        (isAdminUser ? adminCommands : '') +
        usageGuide +
        examples +
        supportInfo,
        {
            parse_mode: 'Markdown',
            reply_markup: kb
        }
    );
}

async function executeUsersCommand(ctx) {
    const { getUserList } = require('./db/db');
    
    const users = await new Promise(r => getUserList(r));
    if (!users || users.length === 0) {
        await ctx.reply('No users found.');
        return;
    }

    const userList = users.map(u => 
        `${u.role === 'ADMIN' ? '🛡️' : '👤'} @${u.username} (${u.telegram_id})`
    ).join('\n');

    await ctx.reply(`*Users List (${users.length}):*\n\n${userList}`, {
        parse_mode: 'Markdown'
    });
}

async function executeGuideCommand(ctx) {
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
• End calls if needed

*Troubleshooting:*
• If call fails, check number format
• Ensure proper authorization
• Contact admin for persistent issues
• Use /status to check bot health

*Need Help?*
Contact: @${config.admin.username} for support.
Version: 2.0.0`;

    const kb = new InlineKeyboard()
        .text('📞 New Call', 'CALL')
        .text('📋 Commands', 'HELP')
        .row()
        .text('🔄 Main Menu', 'MENU');

    await ctx.reply(mainGuide, {
        parse_mode: 'Markdown',
        reply_markup: kb
    });
}

async function executeMenuCommand(ctx, isAdminUser) {
    const kb = new InlineKeyboard()
        .text('📞 New Call', 'CALL')
        .text('📋 Recent Calls', 'CALLS')
        .row()
        .text('🏥 Health Check', 'HEALTH')
        .text('ℹ️ Help', 'HELP')
        .row()
        .text('📚 Guide', 'GUIDE');

    if (isAdminUser) {
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

    const menuText = isAdminUser ? 
        '🛡️ *Administrator Menu*\n\nSelect an action below:' :
        '📋 *Quick Actions Menu*\n\nSelect an action below:';

    await ctx.reply(menuText, {
        parse_mode: 'Markdown',
        reply_markup: kb
    });
}

async function executeHealthCommand(ctx) {
    const axios = require('axios');
    
    try {
        const startTime = Date.now();
        const response = await axios.get(`${config.apiUrl}/health`, {
            timeout: 5000
        });
        const responseTime = Date.now() - startTime;
        
        const health = response.data;
        
        let message = `🏥 *Health Check*\n\n`;
        message += `🤖 Bot: ✅ Responsive\n`;
        message += `🌐 API: ${health.status === 'healthy' ? '✅' : '❌'} ${health.status}\n`;
        message += `⚡ Response Time: ${responseTime}ms\n`;
        message += `📊 Active Calls: ${health.active_calls || 0}\n`;
        message += `⏰ Checked: ${new Date().toLocaleTimeString()}`;
        
        await ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (error) {
        console.error('Health command error:', error);
        await ctx.reply(`❌ *Health Check Failed*\n\nBot is online but API connection failed.\nError: ${error.message}`, { parse_mode: 'Markdown' });
    }
}

async function executeStatusCommand(ctx) {
    const axios = require('axios');
    
    try {
        const response = await axios.get(`${config.apiUrl}/health`, {
            timeout: 10000
        });
        
        const health = response.data;
        
        let message = `🔍 *System Status*\n\n`;
        message += `🤖 Bot: ✅ Online\n`;
        message += `🌐 API: ${health.status === 'healthy' ? '✅' : '❌'} ${health.status}\n`;
        message += `🗄️ Database: ${health.services?.database?.connected ? '✅ Connected' : '❌ Disconnected'}\n`;
        message += `📊 Active Calls: ${health.active_calls || 0}\n`;
        message += `📋 Recent Calls: ${health.services?.database?.recent_calls || 0}\n`;
        message += `📡 Webhook Service: ${health.services?.webhook_service?.status || 'Unknown'}\n`;
        message += `⏰ Last Check: ${new Date(health.timestamp).toLocaleString()}\n\n`;
        message += `📡 API Endpoint: ${config.apiUrl}`;
        
        await ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (error) {
        console.error('Status command error:', error);
        await ctx.reply(`❌ *System Status Check Failed*\n\nError: ${error.message}`, { parse_mode: 'Markdown' });
    }
}

async function executeTestApiCommand(ctx) {
    const axios = require('axios');
    
    try {
        console.log('Testing API connection to:', config.apiUrl);
        const response = await axios.get(`${config.apiUrl}/health`, {
            timeout: 10000
        });
        
        const health = response.data;
        
        let message = `✅ *API Status: ${health.status}*\n\n`;
        message += `🔗 URL: ${config.apiUrl}\n`;
        message += `📊 Active Calls: ${health.active_calls || 0}\n`;
        message += `🗄️ Database: ${health.services?.database?.connected ? '✅ Connected' : '❌ Disconnected'}\n`;
        message += `⏰ Timestamp: ${new Date(health.timestamp).toLocaleString()}`;
        
        // Add enhanced features info if available
        if (health.enhanced_features) {
            message += `\n🚀 Enhanced Features: ✅ Active`;
        }
        
        await ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (error) {
        console.error('API test failed:', error.message);
        await ctx.reply(`❌ *API Test Failed*\n\nURL: ${config.apiUrl}\nError: ${error.message}`, { parse_mode: 'Markdown' });
    }
}

async function executeCallsCommand(ctx) {
    const axios = require('axios');
    
    try {
        const response = await axios.get(`${config.apiUrl}/api/calls?limit=10`, {
            timeout: 15000
        });

        const calls = response.data.calls || [];

        if (!calls || calls.length === 0) {
            return ctx.reply('📋 No calls found');
        }

        let message = `📋 *Recent Calls* (${calls.length})\n\n`;

        calls.forEach((call, index) => {
            const date = new Date(call.created_at).toLocaleDateString();
            const duration = call.duration ? `${Math.floor(call.duration/60)}:${String(call.duration%60).padStart(2,'0')}` : 'N/A';
            const status = call.status || 'Unknown';
            const phoneNumber = call.phone_number;

            message += `${index + 1}\\. 📞 ${phoneNumber.replace(/[^\w\s+]/g, '\\$&')}\n`;
            message += `   🆔 \`${call.call_sid}\`\n`;
            message += `   📅 ${date} \\| ⏱️ ${duration} \\| 📊 ${status.replace(/[^\w\s]/g, '\\$&')}\n`;
            message += `   💬 ${call.transcript_count || 0} messages\n\n`;
        });

        message += `Use /transcript <call\\_sid> to view details`;

        await ctx.reply(message, { parse_mode: 'Markdown' });

    } catch (error) {
        console.error('Error fetching calls list:', error);
        await ctx.reply('❌ Error fetching calls list. Please try again later.');
    }
}

// Register bot commands
bot.api.setMyCommands([
    { command: 'start', description: 'Start or restart the bot' },
    { command: 'call', description: 'Start outbound voice call' },
    { command: 'transcript', description: 'Get call transcript by SID' },
    { command: 'calls', description: 'List recent calls' },
    { command: 'guide', description: 'Show detailed usage guide' },
    { command: 'help', description: 'Show available commands' },
    { command: 'menu', description: 'Show quick action menu' },
    { command: 'health', description: 'Check bot and API health' },
    { command: 'adduser', description: 'Add user (admin only)' },
    { command: 'promote', description: 'Promote to ADMIN (admin only)' },
    { command: 'removeuser', description: 'Remove a USER (admin only)' },
    { command: 'users', description: 'List authorized users (admin only)' },
    { command: 'status', description: 'System status (admin only)' }
]);

// Handle unknown commands and text messages
bot.on('message:text', async (ctx) => {
    const text = ctx.message.text;
    
    // Skip if it's a command that's handled elsewhere
    if (text.startsWith('/')) {
        return;
    }
    
    // For non-command messages outside conversations
    if (!ctx.conversation) {
        await ctx.reply('👋 Use /help to see available commands or /menu for quick actions.');
    }
});

// Start the bot
console.log('🚀 Starting Voice Call Bot...');
bot.start().then(() => {
    console.log('✅ Voice Call Bot is running!');
    console.log('🔄 Polling for updates...');
}).catch((error) => {
    console.error('❌ Failed to start bot:', error);
    process.exit(1);
});