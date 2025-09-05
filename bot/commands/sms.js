const config = require('../config');
const axios = require('axios');
const { getUser, isAdmin } = require('../db/db');

// Simple phone number validation
function isValidPhoneNumber(number) {
    const e164Regex = /^\+[1-9]\d{1,14}$/;
    return e164Regex.test(number.trim());
}

// SMS sending flow (UNCHANGED - already working)
async function smsFlow(conversation, ctx) {
    try {
        await ctx.reply('📱 Enter phone number (E.164 format, e.g., +1234567890):');

        const numMsg = await conversation.wait();
        const number = numMsg?.message?.text?.trim();

        if (!number) return ctx.reply('❌ Please provide a phone number.');
        if (!isValidPhoneNumber(number)) {
            return ctx.reply('❌ Invalid phone number format. Use E.164 format: +1234567890');
        }

        await ctx.reply('💬 Enter the SMS message (max 1600 characters):');
        const msgContent = await conversation.wait();
        const message = msgContent?.message?.text?.trim();

        if (!message) return ctx.reply('❌ Please provide a message.');
        if (message.length > 1600) {
            return ctx.reply('❌ Message too long. SMS messages must be under 1600 characters.');
        }

        const confirmText =
            `📱 *SMS Details:*\n\n` +
            `📞 To: ${number}\n` +
            `💬 Message: ${message.substring(0, 100)}${message.length > 100 ? '...' : ''}\n` +
            `📏 Length: ${message.length} characters\n\n` +
            `⏳ Sending SMS...`;

        await ctx.reply(confirmText, { parse_mode: 'Markdown' });

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
            const successMsg =
                `✅ *SMS Sent Successfully!*\n\n` +
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

// Bulk SMS flow (UNCHANGED - already working)
async function bulkSmsFlow(conversation, ctx) {
    try {
        await ctx.reply('📱 Enter phone numbers separated by commas or newlines (max 100):');

        const numbersMsg = await conversation.wait();
        const numbersText = numbersMsg?.message?.text?.trim();

        if (!numbersText) return ctx.reply('❌ Please provide phone numbers.');

        const numbers = numbersText
            .split(/[,\n]/)
            .map(n => n.trim())
            .filter(n => n.length > 0);

        if (numbers.length === 0) return ctx.reply('❌ No valid phone numbers found.');
        if (numbers.length > 100) return ctx.reply('❌ Maximum 100 phone numbers allowed per bulk send.');

        const invalidNumbers = numbers.filter(n => !isValidPhoneNumber(n));
        if (invalidNumbers.length > 0) {
            return ctx.reply(
                `❌ Invalid phone number format found: ${invalidNumbers.slice(0, 3).join(', ')}${invalidNumbers.length > 3 ? '...' : ''}\n\nUse E.164 format: +1234567890`
            );
        }

        await ctx.reply(`💬 Enter the message to send to ${numbers.length} recipients (max 1600 chars):`);
        const msgContent = await conversation.wait();
        const message = msgContent?.message?.text?.trim();

        if (!message) return ctx.reply('❌ Please provide a message.');
        if (message.length > 1600) {
            return ctx.reply('❌ Message too long. SMS messages must be under 1600 characters.');
        }

        const confirmText =
            `📱 *Bulk SMS Details:*\n\n` +
            `👥 Recipients: ${numbers.length}\n` +
            `📱 Numbers: ${numbers.slice(0, 3).join(', ')}${numbers.length > 3 ? '...' : ''}\n` +
            `💬 Message: ${message.substring(0, 80)}${message.length > 80 ? '...' : ''}\n` +
            `📏 Length: ${message.length} characters\n\n` +
            `⏳ Sending bulk SMS...`;

        await ctx.reply(confirmText, { parse_mode: 'Markdown' });

        const payload = {
            recipients: numbers,
            message: message,
            user_chat_id: ctx.from.id.toString(),
            options: { delay: 1000, batchSize: 10 }
        };

        const response = await axios.post(`${config.apiUrl}/api/sms/bulk`, payload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 120000
        });

        if (response.data.success) {
            const result = response.data;
            const successMsg =
                `✅ *Bulk SMS Completed!*\n\n` +
                `👥 Total Recipients: ${result.total}\n` +
                `✅ Successful: ${result.successful}\n` +
                `❌ Failed: ${result.failed}\n` +
                `📊 Success Rate: ${Math.round((result.successful / result.total) * 100)}%\n\n` +
                `🔔 Individual delivery reports will follow`;

            await ctx.reply(successMsg, { parse_mode: 'Markdown' });

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
        errorMsg += error.response ? `Error: ${error.response.data?.error || 'Unknown error'}` : `Error: ${error.message}`;
        await ctx.reply(errorMsg, { parse_mode: 'Markdown' });
    }
}

// Schedule SMS flow (UNCHANGED - already working)
async function scheduleSmsFlow(conversation, ctx) {
    try {
        await ctx.reply('📱 Enter phone number (E.164 format):');
        const numMsg = await conversation.wait();
        const number = numMsg?.message?.text?.trim();

        if (!number || !isValidPhoneNumber(number)) {
            return ctx.reply('❌ Invalid phone number format. Use E.164 format: +1234567890');
        }

        await ctx.reply('💬 Enter the message:');
        const msgContent = await conversation.wait();
        const message = msgContent?.message?.text?.trim();
        if (!message) return ctx.reply('❌ Please provide a message.');

        await ctx.reply('⏰ Enter schedule time (e.g., "2024-12-25 14:30" or "in 2 hours"):');
        const timeMsg = await conversation.wait();
        const timeText = timeMsg?.message?.text?.trim();
        if (!timeText) return ctx.reply('❌ Please provide a schedule time.');

        let scheduledTime;
        try {
            if (timeText.toLowerCase().includes('in ')) {
                const match = timeText.match(/in (\d+) (minute|minutes|hour|hours|day|days)/i);
                if (match) {
                    const amount = parseInt(match[1]);
                    const unit = match[2].toLowerCase();
                    const now = new Date();
                    if (unit.startsWith('minute')) scheduledTime = new Date(now.getTime() + amount * 60 * 1000);
                    else if (unit.startsWith('hour')) scheduledTime = new Date(now.getTime() + amount * 60 * 60 * 1000);
                    else if (unit.startsWith('day')) scheduledTime = new Date(now.getTime() + amount * 24 * 60 * 60 * 1000);
                } else throw new Error('Invalid relative time format');
            } else {
                scheduledTime = new Date(timeText);
            }

            if (isNaN(scheduledTime.getTime())) throw new Error('Invalid date');
            if (scheduledTime <= new Date()) throw new Error('Schedule time must be in the future');
        } catch {
            return ctx.reply(
                '❌ Invalid time format. Use formats like:\n• "2024-12-25 14:30"\n• "in 2 hours"\n• "in 30 minutes"'
            );
        }

        const confirmText =
            `⏰ *Schedule SMS*\n\n` +
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
            const successMsg =
                `✅ *SMS Scheduled Successfully!*\n\n` +
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

// FIXED: SMS conversation viewer - now gets data from database via API
async function viewSmsConversation(ctx, phoneNumber) {
    try {
        console.log(`Fetching SMS conversation for ${phoneNumber}`);
        
        // First try to get conversation from SMS service (in-memory)
        const response = await axios.get(
            `${config.apiUrl}/api/sms/conversation/${encodeURIComponent(phoneNumber)}`,
            { timeout: 15000 }
        );

        if (response.data.success && response.data.conversation) {
            const conversation = response.data.conversation;
            const messages = conversation.messages;

            let conversationText =
                `💬 *SMS Conversation (Active)*\n\n` +
                `📱 Phone: ${conversation.phone}\n` +
                `💬 Messages: ${messages.length}\n` +
                `🕐 Started: ${new Date(conversation.created_at).toLocaleString()}\n` +
                `⏰ Last Activity: ${new Date(conversation.last_activity).toLocaleString()}\n\n` +
                `*Recent Messages:*\n` +
                `${'─'.repeat(25)}\n`;

            const recentMessages = messages.slice(-10);
            recentMessages.forEach(msg => {
                const time = new Date(msg.timestamp).toLocaleTimeString();
                const sender = msg.role === 'user' ? '👤 Customer' : '🤖 AI';
                const cleanMsg = msg.content.replace(/[*_`[\]()~>#+=|{}.!-]/g, '\\$&');
                conversationText += `\n${sender} _(${time})_\n${cleanMsg}\n`;
            });

            if (messages.length > 10) {
                conversationText += `\n_... and ${messages.length - 10} earlier messages_`;
            }

            await ctx.reply(conversationText, { parse_mode: 'Markdown' });
        } else {
            // If no active conversation, check database for stored SMS messages
            console.log('No active conversation found, checking database...');
            await viewStoredSmsConversation(ctx, phoneNumber);
        }
    } catch (error) {
        console.error('SMS conversation error:', error);
        if (error.response?.status === 404) {
            // Try database lookup as fallback
            await viewStoredSmsConversation(ctx, phoneNumber);
        } else {
            await ctx.reply('❌ Error fetching conversation. Please try again.');
        }
    }
}

// NEW: Get stored SMS conversation from database
async function viewStoredSmsConversation(ctx, phoneNumber) {
    try {
        // Call API endpoint to get stored SMS messages from database
        const response = await axios.get(
            `${config.apiUrl}/api/sms/messages/conversation/${encodeURIComponent(phoneNumber)}`,
            { timeout: 15000 }
        );

        if (response.data.success && response.data.messages.length > 0) {
            const messages = response.data.messages;
            
            let conversationText =
                `💬 *SMS Conversation History*\n\n` +
                `📱 Phone: ${phoneNumber}\n` +
                `💬 Total Messages: ${messages.length}\n` +
                `🕐 First Message: ${new Date(messages[0].created_at).toLocaleString()}\n` +
                `⏰ Last Message: ${new Date(messages[messages.length - 1].created_at).toLocaleString()}\n\n` +
                `*Recent Messages:*\n` +
                `${'─'.repeat(25)}\n`;

            // Show last 15 messages
            const recentMessages = messages.slice(-15);
            recentMessages.forEach(msg => {
                const time = new Date(msg.created_at).toLocaleTimeString();
                const direction = msg.direction === 'inbound' ? '📨 Received' : '📤 Sent';
                const cleanMsg = msg.body.replace(/[*_`[\]()~>#+=|{}.!-]/g, '\\$&');
                const status = msg.status ? ` (${msg.status})` : '';
                
                conversationText += `\n${direction}${status} _(${time})_\n${cleanMsg}\n`;
                
                // Show AI response if available
                if (msg.ai_response && msg.response_message_sid) {
                    const cleanAiMsg = msg.ai_response.replace(/[*_`[\]()~>#+=|{}.!-]/g, '\\$&');
                    conversationText += `🤖 AI Response _(${time})_\n${cleanAiMsg}\n`;
                }
            });

            if (messages.length > 15) {
                conversationText += `\n_... and ${messages.length - 15} earlier messages_`;
            }

            await ctx.reply(conversationText, { parse_mode: 'Markdown' });
        } else {
            await ctx.reply('❌ No conversation found with this phone number');
        }
    } catch (error) {
        console.error('Error fetching stored SMS conversation:', error);
        await ctx.reply('❌ No conversation found with this phone number');
    }
}

// FIXED: SMS statistics - now gets real data from database and service
async function getSmsStats(ctx) {
    try {
        console.log('Fetching SMS stats...');
        
        // Get stats from SMS service (in-memory data)
        const serviceResponse = await axios.get(`${config.apiUrl}/api/sms/stats`, { timeout: 10000 });
        
        // Get additional stats from database
        const dbStatsResponse = await axios.get(`${config.apiUrl}/api/sms/database-stats`, { timeout: 10000 });

        let statsText = `📊 *SMS Statistics*\n\n`;

        if (serviceResponse.data.success) {
            const stats = serviceResponse.data.statistics;
            const conversations = serviceResponse.data.active_conversations || [];

            statsText += 
                `**Active Service Data:**\n` +
                `💬 Active Conversations: ${stats.active_conversations || 0}\n` +
                `⏰ Scheduled Messages: ${stats.scheduled_messages || 0}\n` +
                `📋 Queue Size: ${stats.message_queue_size || 0}\n\n`;

            if (conversations.length > 0) {
                statsText += `*Recent Active Conversations:*\n`;
                conversations.slice(0, 5).forEach(conv => {
                    const lastActivity = new Date(conv.last_activity).toLocaleTimeString();
                    statsText += `• ${conv.phone} - ${conv.message_count} msgs (${lastActivity})\n`;
                });
                statsText += '\n';
            }
        }

        if (dbStatsResponse.data.success) {
            const dbStats = dbStatsResponse.data;
            statsText += 
                `**Database Statistics:**\n` +
                `📱 Total SMS Messages: ${dbStats.total_messages || 0}\n` +
                `📤 Sent Messages: ${dbStats.sent_messages || 0}\n` +
                `📨 Received Messages: ${dbStats.received_messages || 0}\n` +
                `✅ Delivered: ${dbStats.delivered_count || 0}\n` +
                `❌ Failed: ${dbStats.failed_count || 0}\n` +
                `📊 Success Rate: ${dbStats.success_rate || '0'}%\n` +
                `🔄 Bulk Operations: ${dbStats.bulk_operations || 0}\n\n`;

            if (dbStats.recent_messages && dbStats.recent_messages.length > 0) {
                statsText += `*Recent Database Messages:*\n`;
                dbStats.recent_messages.slice(0, 3).forEach(msg => {
                    const time = new Date(msg.created_at).toLocaleTimeString();
                    const direction = msg.direction === 'inbound' ? '📨' : '📤';
                    const phone = msg.to_number || msg.from_number || 'Unknown';
                    statsText += `${direction} ${phone} - ${msg.status} (${time})\n`;
                });
            }
        }

        await ctx.reply(statsText, { parse_mode: 'Markdown' });
        
    } catch (error) {
        console.error('SMS stats error:', error);
        
        // Fallback: try to get basic stats
        try {
            const basicResponse = await axios.get(`${config.apiUrl}/api/sms/database-stats`, { timeout: 5000 });
            if (basicResponse.data.success) {
                const stats = basicResponse.data.statistics;
                const basicStatsText = 
                    `📊 *Basic SMS Statistics*\n\n` +
                    `💬 Active Conversations: ${stats.active_conversations || 0}\n` +
                    `⏰ Scheduled Messages: ${stats.scheduled_messages || 0}\n` +
                    `📋 Queue Size: ${stats.message_queue_size || 0}\n\n` +
                    `_Note: Some detailed statistics are temporarily unavailable_`;
                    
                await ctx.reply(basicStatsText, { parse_mode: 'Markdown' });
            } else {
                await ctx.reply('❌ Error fetching SMS statistics. Service may be down.');
            }
        } catch (fallbackError) {
            await ctx.reply('❌ Error fetching SMS statistics. API server unreachable.');
        }
    }
}

// FIXED: SMS templates - now properly handles the API response
async function showSmsTemplates(ctx) {
    try {
        console.log('Fetching SMS templates...');
        
        const response = await axios.get(`${config.apiUrl}/api/sms/templates`, { timeout: 10000 });
        
        if (response.data.success && response.data.available_templates) {
            const templates = response.data.available_templates;
            
            let templatesText = `📝 *Available SMS Templates*\n\n`;
            
            templates.forEach((template, index) => {
                const displayName = template.replace(/_/g, ' ').toUpperCase();
                templatesText += `${index + 1}. ${displayName}\n`;
            });
            templatesText +=
                `\n💡 *How to use templates:*\n` +
                `• Use /smstemplate <name> to see template content\n` +
                `• Example: /smstemplate welcome\n` +
                `• Example: /smstemplate verification\n\n` +
                `**Available templates:**\n` +
                `• welcome - Welcome message for new users\n` +
                `• appointment_reminder - Appointment reminders\n` +
                `• verification - Verification codes\n` +
                `• order_update - Order status updates\n` +
                `• payment_reminder - Payment reminders\n` +
                `• promotional - Promotional offers\n` +
                `• customer_service - Customer service responses\n` +
                `• survey - Customer satisfaction surveys`;
            
            await ctx.reply(templatesText, { parse_mode: 'Markdown' });
        } else {
            await ctx.reply('❌ Failed to fetch SMS templates. API returned unexpected response.');
        }
    } catch (error) {
        console.error('SMS templates error:', error);
        
        // Provide fallback template list
        const fallbackText = 
            `📝 *SMS Templates (Fallback List)*\n\n` +
            `Service temporarily unavailable. Available templates:\n\n` +
            `1. WELCOME\n` +
            `2. APPOINTMENT REMINDER\n` +
            `3. VERIFICATION\n` +
            `4. ORDER UPDATE\n` +
            `5. PAYMENT REMINDER\n` +
            `6. PROMOTIONAL\n` +
            `7. CUSTOMER SERVICE\n` +
            `8. SURVEY\n\n` +
            `Use /smstemplate <name> to view template content.`;
            
        await ctx.reply(fallbackText, { parse_mode: 'Markdown' });
    }
}

// Register SMS command handlers with conversation flows
function registerSmsCommands(bot) {

    // Main SMS command
    bot.command('sms', async ctx => {
        try {
            const user = await new Promise(resolve => getUser(ctx.from.id, resolve));
            if (!user) {
                return ctx.reply('❌ You are not authorized to use this bot.');
            }
            await ctx.conversation.enter('sms-conversation');
        } catch (error) {
            console.error('SMS command error:', error);
            await ctx.reply('❌ Could not start SMS process. Please try again.');
        }
    });

    // Bulk SMS command
    bot.command('bulksms', async ctx => {
        try {
            const user = await new Promise(resolve => getUser(ctx.from.id, resolve));
            if (!user) { 
                return ctx.reply('❌ You are not authorized to use this bot.');
            }
            const adminStatus = await new Promise(resolve => isAdmin(ctx.from.id, resolve));
            if (!adminStatus) {
                return ctx.reply('❌ Bulk SMS is for administrators only.');
            }
            await ctx.conversation.enter('bulk-sms-conversation');
        } catch (error) {
            console.error('Bulk SMS command error:', error);
            await ctx.reply('❌ Could not start bulk SMS process.');
        }
    });

    // Schedule SMS command
    bot.command('schedulesms', async ctx => {
        try {
            const user = await new Promise(resolve => getUser(ctx.from.id, resolve));
            if (!user) {
                return ctx.reply('❌ You are not authorized to use this bot.');
            }
            await ctx.conversation.enter('schedule-sms-conversation');
        } catch (error) {
            console.error('Schedule SMS command error:', error);
            await ctx.reply('❌ Could not start SMS scheduling.');
        }
    });

    // FIXED: SMS conversation command
    bot.command('smsconversation', async ctx => {
        try {
            const user = await new Promise(r => getUser(ctx.from.id, r));
            if (!user) {
                return ctx.reply('❌ You are not authorized to use this bot.');
            }
            
            const adminStatus = await new Promise(r => isAdmin(ctx.from.id, r));
            if (!adminStatus) {
                return ctx.reply('❌ This command is for administrators only.');
            }

            const args = ctx.message.text.split(' ');
            if (args.length < 2) {
                return ctx.reply(
                    '📱 *Usage:* `/smsconversation <phone_number>`\n\n' +
                    '**Example:** `/smsconversation +1234567890`\n\n' +
                    'This will show the SMS conversation history with the specified phone number.',
                    { parse_mode: 'Markdown' }
                );
            }
            
            const phoneNumber = args[1].trim();
            if (!isValidPhoneNumber(phoneNumber)) {
                return ctx.reply('❌ Invalid phone number format. Use E.164 format: +1234567890');
            }
            
            await ctx.reply(`🔍 Searching for SMS conversation with ${phoneNumber}...`);
            await viewSmsConversation(ctx, phoneNumber);
            
        } catch (error) {
            console.error('SMS conversation command error:', error);
            await ctx.reply('❌ Error viewing SMS conversation. Please check the phone number format and try again.');
        }
    });

    // FIXED: SMS statistics command
    bot.command('smsstats', async ctx => {
        try {
            const user = await new Promise(resolve => getUser(ctx.from.id, resolve));
            if (!user) { 
                return ctx.reply('❌ You are not authorized to use this bot.');
            }

            const adminStatus = await new Promise(resolve => isAdmin(ctx.from.id, resolve));
            if (!adminStatus) {
                return ctx.reply('❌ SMS statistics are for administrators only.');
            }

            await ctx.reply('📊 Fetching SMS statistics...');
            await getSmsStats(ctx);
            
        } catch (error) {
            console.error('SMS stats command error:', error);
            await ctx.reply('❌ Error fetching SMS statistics. Please try again later.');
        }
    });

    // FIXED: SMS templates command
    bot.command('smstemplates', async ctx => {
        try {
            const user = await new Promise(r => getUser(ctx.from.id, r));
            if (!user) {
                return ctx.reply('❌ You are not authorized to use this bot.');
            }

            const adminStatus = await new Promise(r => isAdmin(ctx.from.id, r));
            if (!adminStatus) {
                return ctx.reply('❌ This command is for administrators only.');
            }
            
            await ctx.reply('📝 Fetching SMS templates...');
            await showSmsTemplates(ctx);
            
        } catch (error) {
            console.error('SMS templates command error:', error);
            await ctx.reply('❌ Error fetching SMS templates. Please try again later.');
        }
    });

    // FIXED: Individual template command
    bot.command('smstemplate', async ctx => {
        try {
            const user = await new Promise(r => getUser(ctx.from.id, r));
            if (!user) {
                return ctx.reply('❌ You are not authorized to use this bot.');
            }

            const adminStatus = await new Promise(r => isAdmin(ctx.from.id, r));
            if (!adminStatus) {
                return ctx.reply('❌ This command is for administrators only.');
            }
            
            const args = ctx.message.text.split(' ');
            if (args.length < 2) {
                return ctx.reply(
                    '📝 *Usage:* `/smstemplate <template_name>`\n\n' +
                    '**Examples:**\n' +
                    '• `/smstemplate welcome`\n' +
                    '• `/smstemplate verification`\n' +
                    '• `/smstemplate order_update`\n\n' +
                    '**Available templates:** welcome, appointment_reminder, verification, order_update, payment_reminder, promotional, customer_service, survey',
                    { parse_mode: 'Markdown' }
                );
            }
            
            const templateName = args[1].trim().toLowerCase();
            
            // Sample variables for demonstration
            const sampleVariables = {
                date: '2024-12-25',
                time: '14:30',
                code: '123456',
                amount: '$50.00',
                order_id: 'ORD123456',
                status: 'shipped',
                tracking_url: 'https://track.example.com/123',
                offer_text: '20% off your next purchase',
                promo_code: 'SAVE20',
                expiry_date: '2024-12-31',
                phone: '+1-800-555-0123',
                payment_url: 'https://pay.example.com/invoice123',
                due_date: '2024-12-20'
            };
            
            try {
                const response = await axios.get(`${config.apiUrl}/api/sms/templates`, {
                    params: { 
                        template_name: templateName, 
                        variables: JSON.stringify(sampleVariables) 
                    },
                    timeout: 10000
                });
                
                if (response.data.success) {
                    const templateText =
                        `📝 *Template: ${templateName.toUpperCase().replace('_', ' ')}*\n\n` +
                        `**Content:**\n` +
                        `${response.data.template}\n\n` +
                        `**Sample Variables Used:**\n` +
                        `\`\`\`json\n${JSON.stringify(response.data.variables, null, 2)}\n\`\`\`\n\n` +
                        `**Usage:** You can customize the variables when using this template in your SMS campaigns.`;
                        
                    await ctx.reply(templateText, { parse_mode: 'Markdown' });
                } else {
                    await ctx.reply(`❌ ${response.data.error || 'Template not found'}\n\nUse /smstemplates to see available templates.`);
                }
                
            } catch (apiError) {
                console.error('Template API error:', apiError);
                
                // Provide fallback templates
                const fallbackTemplates = {
                    welcome: 'Welcome to our service! We\'re excited to have you aboard. Reply HELP for assistance or STOP to unsubscribe.',
                    appointment_reminder: 'Reminder: You have an appointment on {date} at {time}. Reply CONFIRM to confirm or RESCHEDULE to change.',
                    verification: 'Your verification code is: {code}. This code will expire in 10 minutes. Do not share this code with anyone.',
                    order_update: 'Order #{order_id} update: {status}. Track your order at {tracking_url}',
                    payment_reminder: 'Payment reminder: Your payment of {amount} is due on {due_date}. Pay now: {payment_url}',
                    promotional: '🎉 Special offer just for you! {offer_text} Use code {promo_code}. Valid until {expiry_date}. Reply STOP to opt out.',
                    customer_service: 'Thanks for contacting us! We\'ve received your message and will respond within 24 hours. For urgent matters, call {phone}.',
                    survey: 'How was your experience with us? Rate us 1-5 stars by replying with a number. Your feedback helps us improve!'
                };
                
                if (fallbackTemplates[templateName]) {
                    // Replace variables with sample data for display
                    let templateContent = fallbackTemplates[templateName];
                    Object.entries(sampleVariables).forEach(([key, value]) => {
                        templateContent = templateContent.replace(new RegExp(`{${key}}`, 'g'), value);
                    });
                    
                    const fallbackText =
                        `📝 *Template: ${templateName.toUpperCase().replace('_', ' ')}* (Cached)\n\n` +
                        `**Content:**\n${templateContent}\n\n` +
                        `**Note:** This is a cached template. Live API temporarily unavailable.\n\n` +
                        `**Original Template:**\n${fallbackTemplates[templateName]}`;
                        
                    await ctx.reply(fallbackText, { parse_mode: 'Markdown' });
                } else {
                    await ctx.reply(
                        `❌ Template '${templateName}' not found.\n\n` +
                        `**Available templates:**\n` +
                        Object.keys(fallbackTemplates).join(', ') +
                        `\n\nUse /smstemplates to see all templates.`
                    );
                }
            }
            
        } catch (error) {
            console.error('SMS template command error:', error);
            await ctx.reply('❌ Error fetching SMS template. Please try again later.');
        }
    });

    // NEW: SMS delivery status check command
    bot.command('smsstatus', async ctx => {
        try {
            const user = await new Promise(r => getUser(ctx.from.id, r));
            if (!user) {
                return ctx.reply('❌ You are not authorized to use this bot.');
            }

            const args = ctx.message.text.split(' ');
            if (args.length < 2) {
                return ctx.reply(
                    '📱 *Usage:* `/smsstatus <message_sid>`\n\n' +
                    '**Example:** `/smsstatus SM1234567890abcdef`\n\n' +
                    'This will show the delivery status of a specific SMS message.',
                    { parse_mode: 'Markdown' }
                );
            }

            const messageSid = args[1].trim();
            
            await ctx.reply(`🔍 Checking status for message: ${messageSid}...`);
            
            try {
                const response = await axios.get(`${config.apiUrl}/api/sms/status/${messageSid}`, {
                    timeout: 10000
                });
                
                if (response.data.success) {
                    const msg = response.data.message;
                    const statusText =
                        `📱 *SMS Status Report*\n\n` +
                        `🆔 **Message SID:** \`${msg.message_sid}\`\n` +
                        `📞 **To:** ${msg.to_number || 'N/A'}\n` +
                        `📤 **From:** ${msg.from_number || 'N/A'}\n` +
                        `📊 **Status:** ${msg.status}\n` +
                        `📅 **Created:** ${new Date(msg.created_at).toLocaleString()}\n` +
                        `🔄 **Updated:** ${new Date(msg.updated_at).toLocaleString()}\n` +
                        `📝 **Message:** ${msg.body.substring(0, 100)}${msg.body.length > 100 ? '...' : ''}\n`;
                        
                    if (msg.error_code || msg.error_message) {
                        statusText += `\n❌ **Error:** ${msg.error_code} - ${msg.error_message}`;
                    }
                    
                    if (msg.ai_response) {
                        statusText += `\n🤖 **AI Response:** ${msg.ai_response.substring(0, 100)}${msg.ai_response.length > 100 ? '...' : ''}`;
                    }
                    
                    await ctx.reply(statusText, { parse_mode: 'Markdown' });
                } else {
                    await ctx.reply(`❌ ${response.data.error || 'Message not found'}`);
                }
            } catch (apiError) {
                console.error('SMS status API error:', apiError);
                await ctx.reply('❌ Error checking SMS status. Message may not exist or API is unavailable.');
            }
            
        } catch (error) {
            console.error('SMS status command error:', error);
            await ctx.reply('❌ Error checking SMS status. Please try again.');
        }
    });

    // NEW: Recent SMS messages command
    bot.command('recentsms', async ctx => {
        try {
            const user = await new Promise(r => getUser(ctx.from.id, r));
            if (!user) {
                return ctx.reply('❌ You are not authorized to use this bot.');
            }

            const adminStatus = await new Promise(r => isAdmin(ctx.from.id, r));
            if (!adminStatus) {
                return ctx.reply('❌ This command is for administrators only.');
            }
            
            const args = ctx.message.text.split(' ');
            const limit = args.length > 1 ? Math.min(parseInt(args[1]) || 10, 20) : 10;
            
            await ctx.reply(`📱 Fetching last ${limit} SMS messages...`);
            
            try {
                const response = await axios.get(`${config.apiUrl}/api/sms/messages/recent`, {
                    params: { limit },
                    timeout: 10000
                });
                
                if (response.data.success && response.data.messages.length > 0) {
                    const messages = response.data.messages;
                    
                    let messagesText = `📱 *Recent SMS Messages (${messages.length})*\n\n`;
                    
                    messages.forEach((msg, index) => {
                        const time = new Date(msg.created_at).toLocaleString();
                        const direction = msg.direction === 'inbound' ? '📨' : '📤';
                        const phone = msg.to_number || msg.from_number || 'Unknown';
                        const statusIcon = msg.status === 'delivered' ? '✅' : 
                                         msg.status === 'failed' ? '❌' : 
                                         msg.status === 'pending' ? '⏳' : '❓';
                        
                        messagesText += 
                            `${index + 1}. ${direction} ${phone} ${statusIcon}\n` +
                            `   Status: ${msg.status} | ${time}\n` +
                            `   Message: ${msg.body.substring(0, 60)}${msg.body.length > 60 ? '...' : ''}\n`;
                            
                        if (msg.error_message) {
                            messagesText += `   Error: ${msg.error_message}\n`;
                        }
                        
                        messagesText += '\n';
                    });
                    
                    messagesText += `Use /smsstatus <message_sid> for detailed status info`;
                    
                    await ctx.reply(messagesText, { parse_mode: 'Markdown' });
                } else {
                    await ctx.reply('📱 No recent SMS messages found.');
                }
                
            } catch (apiError) {
                console.error('Recent SMS API error:', apiError);
                await ctx.reply('❌ Error fetching recent SMS messages. API may be unavailable.');
            }
            
        } catch (error) {
            console.error('Recent SMS command error:', error);
            await ctx.reply('❌ Error fetching recent SMS messages.');
        }
    });
}

module.exports = {
    smsFlow,
    bulkSmsFlow,
    scheduleSmsFlow,
    registerSmsCommands,
    viewSmsConversation,
    getSmsStats,
    showSmsTemplates,
    // Export new functions
    viewStoredSmsConversation
};