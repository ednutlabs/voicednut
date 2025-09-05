// =============================================================================
// BOT SIDE - SMS COMMANDS IMPLEMENTATION
// =============================================================================

// 1. SMS Commands (bot/commands/sms.js)
const config = require('../config');
const axios = require('axios');
const { getUser, isAdmin } = require('../db/db');

// Simple phone number validation
function isValidPhoneNumber(number) {
    const e164Regex = /^\+[1-9]\d{1,14}$/;
    return e164Regex.test(number.trim());
}

// SMS sending flow
async function smsFlow(conversation, ctx) {
    try {
        // Step 1: Get phone number
        await ctx.reply('📱 Enter phone number (E.164 format, e.g., +1234567890):');

        const numMsg = await conversation.wait();
        const number = numMsg?.message?.text?.trim();

        if (!number) {
            return ctx.reply('❌ Please provide a phone number.');
        }

        if (!isValidPhoneNumber(number)) {
            return ctx.reply('❌ Invalid phone number format. Use E.164 format: +1234567890');
        }

        // Step 2: Get message content
        await ctx.reply('💬 Enter the SMS message (max 1600 characters):');
        
        const msgContent = await conversation.wait();
        const message = msgContent?.message?.text?.trim();

        if (!message) {
            return ctx.reply('❌ Please provide a message.');
        }

        if (message.length > 1600) {
            return ctx.reply('❌ Message too long. SMS messages must be under 1600 characters.');
        }

        // Step 3: Show confirmation
        const confirmText = `📱 *SMS Details:*\n\n` +
            `📞 To: ${number}\n` +
            `💬 Message: ${message.substring(0, 100)}${message.length > 100 ? '...' : ''}\n` +
            `📏 Length: ${message.length} characters\n\n` +
            `⏳ Sending SMS...`;

        await ctx.reply(confirmText, { parse_mode: 'Markdown' });

        // Step 4: Send SMS
        const payload = {
            to: number,
            message: message,
            user_chat_id: ctx.from.id.toString()
        };

        const response = await axios.post(`${config.apiUrl}/api/sms/send`, payload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 30000
        });

        if (response.data.success) {
            const successMsg = `✅ *SMS Sent Successfully!*\n\n` +
                `📱 To: ${response.data.to}\n` +
                `🆔 Message SID: \`${response.data.message_sid}\`\n` +
                `📊 Status: ${response.data.status}\n` +
                `📤 From: ${response.data.from}\n\n` +
                `🔔 You'll receive delivery notifications`;

            await ctx.reply(successMsg, { parse_mode: 'Markdown' });
        } else {
            await ctx.reply('⚠️ SMS was sent but response format unexpected. Check logs.');
        }

    } catch (error) {
        console.error('SMS send error:', error);

        let errorMsg = '❌ *SMS Failed*\n\n';

        if (error.response) {
            const status = error.response.status;
            const errorData = error.response.data;

            if (status === 400) {
                errorMsg += `Bad Request: ${errorData?.error || 'Invalid data'}`;
            } else if (status === 500) {
                errorMsg += `Server Error: ${errorData?.error || 'Internal server error'}`;
            } else {
                errorMsg += `HTTP ${status}: ${errorData?.error || error.response.statusText}`;
            }
        } else if (error.request) {
            errorMsg += `Network Error: Cannot reach API server\nURL: ${config.apiUrl}`;
        } else {
            errorMsg += `Error: ${error.message}`;
        }

        await ctx.reply(errorMsg, { parse_mode: 'Markdown' });
    }
}

// Bulk SMS flow
async function bulkSmsFlow(conversation, ctx) {
    try {
        // Step 1: Get phone numbers
        await ctx.reply('📱 Enter phone numbers separated by commas or newlines (max 100):');

        const numbersMsg = await conversation.wait();
        const numbersText = numbersMsg?.message?.text?.trim();

        if (!numbersText) {
            return ctx.reply('❌ Please provide phone numbers.');
        }

        // Parse phone numbers
        const numbers = numbersText
            .split(/[,\n]/)
            .map(n => n.trim())
            .filter(n => n.length > 0);

        if (numbers.length === 0) {
            return ctx.reply('❌ No valid phone numbers found.');
        }

        if (numbers.length > 100) {
            return ctx.reply('❌ Maximum 100 phone numbers allowed per bulk send.');
        }

        // Validate phone numbers
        const invalidNumbers = numbers.filter(n => !isValidPhoneNumber(n));
        if (invalidNumbers.length > 0) {
            return ctx.reply(`❌ Invalid phone number format found: ${invalidNumbers.slice(0, 3).join(', ')}${invalidNumbers.length > 3 ? '...' : ''}\n\nUse E.164 format: +1234567890`);
        }

        // Step 2: Get message content
        await ctx.reply(`💬 Enter the message to send to ${numbers.length} recipients (max 1600 chars):`);
        
        const msgContent = await conversation.wait();
        const message = msgContent?.message?.text?.trim();

        if (!message) {
            return ctx.reply('❌ Please provide a message.');
        }

        if (message.length > 1600) {
            return ctx.reply('❌ Message too long. SMS messages must be under 1600 characters.');
        }

        // Step 3: Show confirmation
        const confirmText = `📱 *Bulk SMS Details:*\n\n` +
            `👥 Recipients: ${numbers.length}\n` +
            `📱 Numbers: ${numbers.slice(0, 3).join(', ')}${numbers.length > 3 ? '...' : ''}\n` +
            `💬 Message: ${message.substring(0, 80)}${message.length > 80 ? '...' : ''}\n` +
            `📏 Length: ${message.length} characters\n\n` +
            `⏳ Sending bulk SMS...`;

        await ctx.reply(confirmText, { parse_mode: 'Markdown' });

        // Step 4: Send bulk SMS
        const payload = {
            recipients: numbers,
            message: message,
            user_chat_id: ctx.from.id.toString(),
            options: { delay: 1000, batchSize: 10 }
        };

        const response = await axios.post(`${config.apiUrl}/api/sms/bulk`, payload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 120000 // 2 minutes for bulk operations
        });

        if (response.data.success) {
            const result = response.data;
            const successMsg = `✅ *Bulk SMS Completed!*\n\n` +
                `👥 Total Recipients: ${result.total}\n` +
                `✅ Successful: ${result.successful}\n` +
                `❌ Failed: ${result.failed}\n` +
                `📊 Success Rate: ${Math.round((result.successful / result.total) * 100)}%\n\n` +
                `🔔 Individual delivery reports will follow`;

            await ctx.reply(successMsg, { parse_mode: 'Markdown' });

            // Show failed numbers if any
            if (result.failed > 0) {
                const failedResults = result.results.filter(r => !r.success);
                if (failedResults.length <= 10) {
                    let failedMsg = '❌ *Failed Numbers:*\n\n';
                    failedResults.forEach(r => {
                        failedMsg += `• ${r.recipient}: ${r.error}\n`;
                    });
                    await ctx.reply(failedMsg, { parse_mode: 'Markdown' });
                }
            }
        } else {
            await ctx.reply('⚠️ Bulk SMS completed but response format unexpected.');
        }

    } catch (error) {
        console.error('Bulk SMS error:', error);

        let errorMsg = '❌ *Bulk SMS Failed*\n\n';

        if (error.response) {
            const errorData = error.response.data;
            errorMsg += `Error: ${errorData?.error || 'Unknown error'}`;
        } else {
            errorMsg += `Error: ${error.message}`;
        }

        await ctx.reply(errorMsg, { parse_mode: 'Markdown' });
    }
}

// Schedule SMS flow
async function scheduleSmsFlow(conversation, ctx) {
    try {
        // Step 1: Get phone number
        await ctx.reply('📱 Enter phone number (E.164 format):');

        const numMsg = await conversation.wait();
        const number = numMsg?.message?.text?.trim();

        if (!number || !isValidPhoneNumber(number)) {
            return ctx.reply('❌ Invalid phone number format. Use E.164 format: +1234567890');
        }

        // Step 2: Get message
        await ctx.reply('💬 Enter the message:');
        
        const msgContent = await conversation.wait();
        const message = msgContent?.message?.text?.trim();

        if (!message) {
            return ctx.reply('❌ Please provide a message.');
        }

        // Step 3: Get schedule time
        await ctx.reply('⏰ Enter schedule time (e.g., "2024-12-25 14:30" or "in 2 hours"):');
        
        const timeMsg = await conversation.wait();
        const timeText = timeMsg?.message?.text?.trim();

        if (!timeText) {
            return ctx.reply('❌ Please provide a schedule time.');
        }

        // Parse time (simplified - in production, use a proper date parsing library)
        let scheduledTime;
        try {
            if (timeText.toLowerCase().includes('in ')) {
                // Handle relative time like "in 2 hours"
                const match = timeText.match(/in (\d+) (minute|minutes|hour|hours|day|days)/i);
                if (match) {
                    const amount = parseInt(match[1]);
                    const unit = match[2].toLowerCase();
                    const now = new Date();
                    
                    if (unit.startsWith('minute')) {
                        scheduledTime = new Date(now.getTime() + (amount * 60 * 1000));
                    } else if (unit.startsWith('hour')) {
                        scheduledTime = new Date(now.getTime() + (amount * 60 * 60 * 1000));
                    } else if (unit.startsWith('day')) {
                        scheduledTime = new Date(now.getTime() + (amount * 24 * 60 * 60 * 1000));
                    }
                } else {
                    throw new Error('Invalid relative time format');
                }
            } else {
                // Handle absolute time
                scheduledTime = new Date(timeText);
            }

            if (isNaN(scheduledTime.getTime())) {
                throw new Error('Invalid date');
            }

            if (scheduledTime <= new Date()) {
                throw new Error('Schedule time must be in the future');
            }
        } catch (timeError) {
            return ctx.reply('❌ Invalid time format. Use formats like:\n• "2024-12-25 14:30"\n• "in 2 hours"\n• "in 30 minutes"');
        }

        // Step 4: Confirm and schedule
        const confirmText = `⏰ *Schedule SMS*\n\n` +
            `📱 To: ${number}\n` +
            `💬 Message: ${message.substring(0, 100)}${message.length > 100 ? '...' : ''}\n` +
            `📅 Scheduled: ${scheduledTime.toLocaleString()}\n\n` +
            `⏳ Scheduling SMS...`;

        await ctx.reply(confirmText, { parse_mode: 'Markdown' });

        const payload = {
            to: number,
            message: message,
            scheduled_time: scheduledTime.toISOString(),
            user_chat_id: ctx.from.id.toString()
        };

        const response = await axios.post(`${config.apiUrl}/api/sms/schedule`, payload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 30000
        });

        if (response.data.success) {
            const successMsg = `✅ *SMS Scheduled Successfully!*\n\n` +
                `🆔 Schedule ID: \`${response.data.schedule_id}\`\n` +
                `📅 Will send: ${new Date(response.data.scheduled_time).toLocaleString()}\n` +
                `📱 To: ${number}\n\n` +
                `🔔 You'll receive confirmation when sent`;

            await ctx.reply(successMsg, { parse_mode: 'Markdown' });
        }

    } catch (error) {
        console.error('Schedule SMS error:', error);
        await ctx.reply('❌ Failed to schedule SMS. Please try again.');
    }
}

// SMS conversation viewer
async function viewSmsConversation(ctx, phoneNumber) {
    try {
        const response = await axios.get(`${config.apiUrl}/api/sms/conversation/${encodeURIComponent(phoneNumber)}`, {
            timeout: 15000
        });

        if (!response.data.success || !response.data.conversation) {
            return ctx.reply('❌ No conversation found with this number');
        }

        const conversation = response.data.conversation;
        const messages = conversation.messages;

        let conversationText = `💬 *SMS Conversation*\n\n`;
        conversationText += `📱 Phone: ${conversation.phone}\n`;
        conversationText += `💬 Messages: ${messages.length}\n`;
        conversationText += `🕐 Started: ${new Date(conversation.created_at).toLocaleString()}\n`;
        conversationText += `⏰ Last Activity: ${new Date(conversation.last_activity).toLocaleString()}\n\n`;

        conversationText += `*Recent Messages:*\n`;
        conversationText += `${'─'.repeat(25)}\n`;

        const recentMessages = messages.slice(-10); // Last 10 messages
        recentMessages.forEach(msg => {
            const time = new Date(msg.timestamp).toLocaleTimeString();
            const sender = msg.role === 'user' ? '👤 Customer' : '🤖 AI';
            const cleanMsg = msg.content.replace(/[*_`\[\]()~>#+=|{}.!-]/g, '\\$&');
            
            conversationText += `\n${sender} _(${time})_\n${cleanMsg}\n`;
        });

        if (messages.length > 10) {
            conversationText += `\n_... and ${messages.length - 10} earlier messages_`;
        }

        await ctx.reply(conversationText, { parse_mode: 'Markdown' });

    } catch (error) {
        console.error('SMS conversation error:', error);
        if (error.response?.status === 404) {
            await ctx.reply('❌ No conversation found with this phone number');
        } else {
            await ctx.reply('❌ Error fetching conversation. Please try again.');
        }
    }
}

// SMS statistics
async function getSmsStats(ctx) {
    try {
        const response = await axios.get(`${config.apiUrl}/api/sms/stats`, {
            timeout: 10000
        });

        if (response.data.success) {
            const stats = response.data.statistics;
            const conversations = response.data.active_conversations;

            let statsText = `📊 *SMS Statistics*\n\n`;
            statsText += `💬 Active Conversations: ${stats.active_conversations}\n`;
            statsText += `⏰ Scheduled Messages: ${stats.scheduled_messages}\n`;
            statsText += `📱 Messages Today: ${stats.total_conversations_today}\n`;
            statsText += `📋 Queue Size: ${stats.message_queue_size}\n\n`;

            if (conversations.length > 0) {
                statsText += `*Recent Conversations:*\n`;
                conversations.slice(0, 5).forEach(conv => {
                    const lastActivity = new Date(conv.last_activity).toLocaleTimeString();
                    statsText += `• ${conv.phone} - ${conv.message_count} msgs (${lastActivity})\n`;
                });
            }

            await ctx.reply(statsText, { parse_mode: 'Markdown' });
        } else {
            await ctx.reply('❌ Failed to fetch SMS statistics');
        }

    } catch (error) {
        console.error('SMS stats error:', error);
        await ctx.reply('❌ Error fetching SMS statistics');
    }
}

// SMS templates
async function showSmsTemplates(ctx) {
    try {
        const response = await axios.get(`${config.apiUrl}/api/sms/templates`, {
            timeout: 10000
        });

        if (response.data.success) {
            const templates = response.data.available_templates;

            let templatesText = `📝 *Available SMS Templates*\n\n`;
            templates.forEach((template, index) => {
                const displayName = template.replace(/_/g, ' ').toUpperCase();
                templatesText += `${index + 1}. ${displayName}\n`;
            });

            templatesText += `\n💡 Use /sms_template <name> to see template content\n`;
            templatesText += `Example: /sms_template welcome`;

            await ctx.reply(templatesText, { parse_mode: 'Markdown' });
        } else {
            await ctx.reply('❌ Failed to fetch SMS templates');
        }

    } catch (error) {
        console.error('SMS templates error:', error);
        await ctx.reply('❌ Error fetching SMS templates');
    }
}

// Register SMS command handlers
function registerSmsCommands(bot) {
    // Main SMS command
    bot.command('sms', async (ctx) => {
        try {
            const user = await new Promise(r => getUser(ctx.from.id, r));
            if (!user) {
                return ctx.reply('❌ You are not authorized to use this bot.');
            }

            await ctx.conversation.enter("sms-conversation");
        } catch (error) {
            console.error('SMS command error:', error);
            await ctx.reply('❌ Could not start SMS process. Please try again.');
        }
    });

    // Bulk SMS command
    bot.command('bulk_sms', async (ctx) => {
        try {
            const user = await new Promise(r => getUser(ctx.from.id, r));
            if (!user) {
                return ctx.reply('❌ You are not authorized to use this bot.');
            }

            const adminStatus = await new Promise(r => isAdmin(ctx.from.id, r));
            if (!adminStatus) {
                return ctx.reply('❌ Bulk SMS is for administrators only.');
            }

            await ctx.conversation.enter("bulk-sms-conversation");
        } catch (error) {
            console.error('Bulk SMS command error:', error);
            await ctx.reply('❌ Could not start bulk SMS process.');
        }
    });

    // Schedule SMS command
    bot.command('schedule_sms', async (ctx) => {
        try {
            const user = await new Promise(r => getUser(ctx.from.id, r));
            if (!user) {
                return ctx.reply('❌ You are not authorized to use this bot.');
            }

            await ctx.conversation.enter("schedule-sms-conversation");
        } catch (error) {
            console.error('Schedule SMS command error:', error);
            await ctx.reply('❌ Could not start SMS scheduling.');
        }
    });

    // SMS conversation command
    bot.command('sms_conversation', async (ctx) => {
        try {
            const user = await new Promise(r => getUser(ctx.from.id, r));
            if (!user) {
                return ctx.reply('❌ You are not authorized to use this bot.');
            }

            const args = ctx.message.text.split(' ');
            if (args.length < 2) {
                return ctx.reply('📱 Usage: /sms\\_conversation <phone\\_number>\n\nExample: /sms\\_conversation +1234567890', {
                    parse_mode: 'Markdown'
                });
            }

            const phoneNumber = args[1].trim();
            if (!isValidPhoneNumber(phoneNumber)) {
                return ctx.reply('❌ Invalid phone number format. Use E.164 format: +1234567890');
            }

            await viewSmsConversation(ctx, phoneNumber);
        } catch (error) {
            console.error('SMS conversation command error:', error);
            await ctx.reply('❌ Error viewing SMS conversation.');
        }
    });

    // SMS statistics command
    bot.command('sms_stats', async (ctx) => {
        try {
            const user = await new Promise(r => getUser(ctx.from.id, r));
            if (!user) {
                return ctx.reply('❌ You are not authorized to use this bot.');
            }

            const adminStatus = await new Promise(r => isAdmin(ctx.from.id, r));
            if (!adminStatus) {
                return ctx.reply('❌ SMS statistics are for administrators only.');
            }

            await getSmsStats(ctx);
        } catch (error) {
            console.error('SMS stats command error:', error);
            await ctx.reply('❌ Error fetching SMS statistics.');
        }
    });

    // SMS templates command
    bot.command('sms_templates', async (ctx) => {
        try {
            const user = await new Promise(r => getUser(ctx.from.id, r));
            if (!user) {
                return ctx.reply('❌ You are not authorized to use this bot.');
            }

            await showSmsTemplates(ctx);
        } catch (error) {
            console.error('SMS templates command error:', error);
            await ctx.reply('❌ Error fetching SMS templates.');
        }
    });

    // Individual template command
    bot.command('sms_template', async (ctx) => {
        try {
            const user = await new Promise(r => getUser(ctx.from.id, r));
            if (!user) {
                return ctx.reply('❌ You are not authorized to use this bot.');
            }

            const args = ctx.message.text.split(' ');
            if (args.length < 2) {
                return ctx.reply('📝 Usage: /sms\\_template <template\\_name>\n\nExample: /sms\\_template welcome', {
                    parse_mode: 'Markdown'
                });
            }

            const templateName = args[1].trim();
            const variables = args.length > 2 ? JSON.stringify({ 
                date: '2024-12-25', 
                time: '14:30', 
                code: '123456',
                amount: '$50.00'
            }) : '{}';

            const response = await axios.get(`${config.apiUrl}/api/sms/templates`, {
                params: { template_name: templateName, variables },
                timeout: 10000
            });

            if (response.data.success) {
                const templateText = `📝 *Template: ${templateName.toUpperCase()}*\n\n` +
                    `${response.data.template}\n\n` +
                    `💡 Variables used: ${JSON.stringify(response.data.variables, null, 2)}`;

                await ctx.reply(templateText, { parse_mode: 'Markdown' });
            } else {
                await ctx.reply(`❌ ${response.data.error || 'Template not found'}`);
            }

        } catch (error) {
            console.error('SMS template command error:', error);
            await ctx.reply('❌ Error fetching SMS template.');
        }
    });
}

module.exports = {
    smsFlow,
    bulkSmsFlow,
    scheduleSmsFlow,
    registerSmsCommands,
    viewSmsConversation,
    getSmsStats
};

// =============================================================================
// 2. Update bot/bot.js to include SMS functionality
// =============================================================================

// Add this to your bot/bot.js file:

// Import SMS commands
const { 
    smsFlow, 
    bulkSmsFlow, 
    scheduleSmsFlow, 
    registerSmsCommands 
} = require('./commands/sms');

// Register SMS conversations (add after existing conversations)
bot.use(wrapConversation(smsFlow, "sms-conversation"));
bot.use(wrapConversation(bulkSmsFlow, "bulk-sms-conversation"));
bot.use(wrapConversation(scheduleSmsFlow, "schedule-sms-conversation"));

// Register SMS commands
registerSmsCommands(bot);

// Update callback query handler to include SMS actions
// Add these cases to your existing callback query handler:

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
        await executeCommand(ctx, 'sms_stats');
    }
    break;

// Update main menu to include SMS options
// Modify your executeMenuCommand function:

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

// Update help command to include SMS commands
// Modify your help text in commands/help.js:

let helpText = `📱 <b>Basic Commands</b>
• /start - Restart bot &amp; show main menu
• /call - Start a new voice call
• /sms - Send an SMS message
• /sms_conversation &lt;phone&gt; - View SMS conversation
• /transcript &lt;call_sid&gt; - Get call transcript
• /calls [limit] - List recent calls (max 50)
• /sms_templates - View available SMS templates
• /sms_template &lt;name&gt; - View specific template
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
• /bulk_sms - Send bulk SMS messages
• /schedule_sms - Schedule SMS for later
• /sms_stats - View SMS statistics
• /status - Full system status check
• /test_api - Test API connection`;
}

// =============================================================================
// 3. Update API commands list registration
// =============================================================================

// Update your bot.api.setMyCommands in bot/bot.js:

bot.api.setMyCommands([
    { command: 'start', description: 'Start or restart the bot' },
    { command: 'call', description: 'Start outbound voice call' },
    { command: 'sms', description: 'Send SMS message' },
    { command: 'transcript', description: 'Get call transcript by SID' },
    { command: 'calls', description: 'List recent calls' },
    { command: 'sms_conversation', description: 'View SMS conversation' },
    { command: 'sms_templates', description: 'View SMS templates' },
    { command: 'guide', description: 'Show detailed usage guide' },
    { command: 'help', description: 'Show available commands' },
    { command: 'menu', description: 'Show quick action menu' },
    { command: 'health', description: 'Check bot and API health' },
    { command: 'bulk_sms', description: 'Send bulk SMS (admin only)' },
    { command: 'schedule_sms', description: 'Schedule SMS message' },
    { command: 'sms_stats', description: 'SMS statistics (admin only)' },
    { command: 'adduser', description: 'Add user (admin only)' },
    { command: 'promote', description: 'Promote to ADMIN (admin only)' },
    { command: 'removeuser', description: 'Remove a USER (admin only)' },
    { command: 'users', description: 'List authorized users (admin only)' },
    { command: 'status', description: 'System status (admin only)' }
]);

// 