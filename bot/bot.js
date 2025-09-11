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
const { smsFlow, bulkSmsFlow, scheduleSmsFlow, registerSmsCommands } = require('./commands/sms');

// Register conversations with error handling
bot.use(wrapConversation(callFlow, "call-conversation"));
bot.use(wrapConversation(addUserFlow, "adduser-conversation"));
bot.use(wrapConversation(promoteFlow, "promote-conversation"));
bot.use(wrapConversation(removeUserFlow, "remove-conversation"));
bot.use(wrapConversation(scheduleSmsFlow, "schedule-sms-conversation"));
bot.use(wrapConversation(smsFlow, "sms-conversation"));
bot.use(wrapConversation(bulkSmsFlow, "bulk-sms-conversation"));

// Register command handlers
registerCallCommand(bot);
registerAddUserCommand(bot);
registerPromoteCommand(bot);
registerRemoveUserCommand(bot);
registerSmsCommands(bot);


// Register non-conversation commands
require('./commands/users')(bot);
require('./commands/help')(bot);
require('./commands/menu')(bot);
require('./commands/guide')(bot);
require('./commands/transcript')(bot);
require('./commands/api')(bot);
require('./commands/webapp')(bot);

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
            '👋 *Welcome to Voicednut Bot!*\n\nYou can make voice calls using AI agents.';

        // Get the Mini App URL from config
        const webAppUrl = config.webAppUrl;
        
        // Prepare keyboard with Mini App button if URL is configured
        const kb = new InlineKeyboard();
        
        // Add Mini App button if URL is configured
        if (webAppUrl) {
            kb.webApp('🚀 Open Mini App', webAppUrl)
              .row();
        }
        
        // Add other buttons
        kb.text('📞 New Call', 'CALL')
          .text('📚 Guide', 'GUIDE')
            .row()
            .text('💬 New Sms', 'SMS')
            .text('🏥 Health', 'HEALTH')            
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

        // Prepare the message with conditional Mini App notice
        let message = `${welcomeText}\n\n${userStats}\n\n`;
        
        // Add Mini App notice only if it's configured
        if (config.webAppUrl) {
            message += '🚀 *Try our Mini App for a better experience!*\n' +
                      'Click the Mini App button below to access enhanced features.\n\n';
        }
        
        message += 'Use the buttons below or type /help for available commands.';
        
        await ctx.reply(message, {
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
            'REMOVE': 'remove-conversation',
            'SMS': 'sms-conversation',
            'BULK_SMS': 'bulk-sms-conversation',
            'SCHEDULE_SMS': 'schedule-sms-conversation'
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
                    try {
                        await executeUsersCommand(ctx);
                    } catch (usersError) {
                        console.error('Users callback error:', usersError);
                        await ctx.reply('❌ Error displaying users list. Please try again.');
                    }
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

            case 'SMS':
                await ctx.reply(`Starting SMS process...`);
                await ctx.conversation.enter('sms-conversation');
                break;
                
            case 'BULK_SMS':
                if (isAdminUser) {
                    await ctx.reply(`Starting bulk SMS process...`);
                    await ctx.conversation.enter('bulk-sms-conversation');
                }
                break;
            
            case 'SCHEDULE_SMS':
                await ctx.reply(`Starting SMS scheduling...`);
                await ctx.conversation.enter('schedule-sms-conversation');
                break;
            
                case 'SMS_STATS':
                    if (isAdminUser) {
                        await executeCommand(ctx, 'smsstats');
                    }
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
async function executeHelpCommand(ctx) {
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
• /app - Open the Mini App
• /sms - Send an SMS message
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
        .text('📱 New SMS', 'SMS')
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
}

async function executeUsersCommand(ctx) {
    try {
        const { getUserList } = require('./db/db');
        
        const users = await new Promise((resolve, reject) => {
            getUserList((err, result) => {
                if (err) {
                    console.error('Database error in getUserList:', err);
                    reject(err);
                } else {
                    resolve(result);
                }
            });
        });

        if (!users || users.length === 0) {
            await ctx.reply('📋 No users found in the system.');
            return;
        }

        // Create user list without problematic markdown - use plain text
        let message = `📋 USERS LIST (${users.length}):\n\n`;
        
        users.forEach((user, index) => {
            const roleIcon = user.role === 'ADMIN' ? '🛡️' : '👤';
            const username = user.username || 'no_username';
            const joinDate = new Date(user.timestamp).toLocaleDateString();
            message += `${index + 1}. ${roleIcon} @${username}\n`;
            message += `   ID: ${user.telegram_id}\n`;
            message += `   Role: ${user.role}\n`;
            message += `   Joined: ${joinDate}\n\n`;
        });

        // Send without parse_mode to avoid markdown parsing errors
        await ctx.reply(message);

    } catch (error) {
        console.error('executeUsersCommand error:', error);
        await ctx.reply('❌ Error fetching users list. Please try again.');
    }
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
        .text('🔄 Main Menu', 'MENU')
        .text('New SMS', 'SMS');

    await ctx.reply(mainGuide, {
        parse_mode: 'Markdown',
        reply_markup: kb
    });
}

async function executeMenuCommand(ctx, isAdminUser) {
    const kb = new InlineKeyboard()
        .text('📞 New Call', 'CALL')
        .text('📱 Send SMS', 'SMS')
        .row()
        .text('📋 Recent Calls', 'CALLS')
        .text('💬 SMS Stats', 'SMS_STATS')
        .row()
        .text('🏥 Health Check', 'HEALTH')
        .text('ℹ️ Help', 'HELP')
        .row()
        .text('📚 Guide', 'GUIDE');

    if (isAdminUser) {
        kb.row()
            .text('📤 Bulk SMS', 'BULK_SMS')
            .text('⏰ Schedule SMS', 'SCHEDULE_SMS')
            .row()
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
        console.log('Executing calls command via callback...');
        
        let response;
        let calls = [];
        
        // Try multiple API endpoints in order of preference
        const endpoints = [
            `${config.apiUrl}/api/calls/list?limit=10`,  // Enhanced endpoint
            `${config.apiUrl}/api/calls?limit=10`,       // Basic endpoint
        ];
        
        let lastError = null;
        let successfulEndpoint = null;
        
        for (const endpoint of endpoints) {
            try {
                console.log(`Trying endpoint: ${endpoint}`);
                
                response = await axios.get(endpoint, {
                    timeout: 15000,
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    }
                });

                console.log(`Success! API Response status: ${response.status}`);
                successfulEndpoint = endpoint;
                
                // Handle different response structures
                if (response.data.calls) {
                    calls = response.data.calls;
                } else if (Array.isArray(response.data)) {
                    calls = response.data;
                } else {
                    console.log('Unexpected response structure:', Object.keys(response.data));
                    continue; // Try next endpoint
                }
                
                break; // Success, exit loop
                
            } catch (endpointError) {
                console.log(`Endpoint ${endpoint} failed:`, endpointError.message);
                lastError = endpointError;
                continue; // Try next endpoint
            }
        }
        
        // If all endpoints failed
        if (!calls || calls.length === 0) {
            if (lastError) {
                throw lastError; // Re-throw the last error for proper handling
            } else {
                return ctx.reply('📋 No calls found');
            }
        }

        console.log(`Successfully fetched ${calls.length} calls from: ${successfulEndpoint}`);

        let message = `📋 *Recent Calls* (${calls.length})\n\n`;

        calls.forEach((call, index) => {
            const date = new Date(call.created_at).toLocaleDateString();
            const duration = call.duration ? `${Math.floor(call.duration/60)}:${String(call.duration%60).padStart(2,'0')}` : 'N/A';
            const status = call.status || 'Unknown';
            const phoneNumber = call.phone_number;

            // Escape special characters for Markdown
            const escapedPhone = phoneNumber.replace(/[^\w\s+]/g, '\\$&');
            const escapedStatus = status.replace(/[^\w\s]/g, '\\$&');

            message += `${index + 1}\\. 📞 ${escapedPhone}\n`;
            message += `   🆔 \`${call.call_sid}\`\n`;
            message += `   📅 ${date} \\| ⏱️ ${duration} \\| 📊 ${escapedStatus}\n`;
            message += `   💬 ${call.transcript_count || 0} messages\n\n`;
        });

        message += `Use /transcript <call\\_sid> to view details`;

        await ctx.reply(message, { parse_mode: 'Markdown' });

    } catch (error) {
        console.error('Error fetching calls list via callback:', error);
        
        // Provide specific error messages based on error type
        if (error.response?.status === 404) {
            await ctx.reply(
                '❌ *API Endpoints Missing*\n\n' +
                'The calls list endpoints are not available on the server\\.\n\n' +
                '*Missing endpoints:*\n' +
                '• `/api/calls` \\- Basic calls listing\n' +
                '• `/api/calls/list` \\- Enhanced calls listing\n\n' +
                'Please contact your system administrator to add these endpoints to the Express application\\.',
                { parse_mode: 'Markdown' }
            );
        } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
            await ctx.reply(
                `❌ *Server Connection Failed*\n\n` +
                `Cannot connect to API server at:\n\`${config.apiUrl}\`\n\n` +
                `Please check if the server is running\\.`,
                { parse_mode: 'Markdown' }
            );
        } else if (error.response?.status === 500) {
            await ctx.reply('❌ Server error while fetching calls. Please try again later.');
        } else if (error.response) {
            await ctx.reply(`❌ API error (${error.response.status}): ${error.response.data?.error || 'Unknown error'}`);
        } else {
            await ctx.reply('❌ Error fetching calls list. Please try again later.');
        }
    }
}

// Mini App command handler
bot.command('miniapp', async (ctx) => {
    try {
        // Verify user authorization
        const user = await new Promise(r => getUser(ctx.from.id, r));
        if (!user) {
            return ctx.reply('❌ You are not authorized to use this bot.');
        }

        // Check if Mini App URL is configured
        if (!config.webAppUrl) {
            return ctx.reply('❌ Mini App is not configured. Please contact the administrator.');
        }

        const kb = new InlineKeyboard()
            .webApp('🚀 Launch Mini App', config.webAppUrl);

        await ctx.reply(
            '🎯 *Voice Call Bot Mini App*\n\n' +
            'Access enhanced features through our Mini App:\n' +
            '• 📱 Modern interface\n' +
            '• 🚀 Quick access to all features\n' +
            '• 📊 Real-time call monitoring\n' +
            '• 💬 Instant messaging\n\n' +
            'Click the button below to open the Mini App.',
            {
                parse_mode: 'Markdown',
                reply_markup: kb
            }
        );
    } catch (error) {
        console.error('Mini App command error:', error);
        await ctx.reply('❌ Error launching Mini App. Please try again or contact support.');
    }
});

// Register bot commands
bot.api.setMyCommands([
    { command: 'start', description: 'Start or restart the bot' },
    { command: 'miniapp', description: 'Open the Voice Call Mini App' },
    { command: 'call', description: 'Start outbound voice call' },
    { command: 'sms', description: 'Send SMS message' },
    { command: 'transcript', description: 'Get call transcript by SID' },
    { command: 'calls', description: 'List recent calls' },
    { command: 'smstemplates', description: 'View SMS templates' },
    { command: 'smsconversation', description: 'View SMS conversation' },
    { command: 'guide', description: 'Show detailed usage guide' },
    { command: 'help', description: 'Show available commands' },
    { command: 'menu', description: 'Show quick action menu' },
    { command: 'health', description: 'Check bot and API health' },
    { command: 'bulksms', description: 'Send bulk SMS (admin only)' },
    { command: 'schedulesms', description: 'Schedule SMS message' },
    { command: 'smsstats', description: 'SMS statistics (admin only)' },
    { command: 'smstemplate', description: 'View specific SMS template'},
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
