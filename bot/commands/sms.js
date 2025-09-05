// bot/commands/sms.js
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

// Bulk SMS flow
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

// Schedule SMS flow
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

// SMS conversation viewer
async function viewSmsConversation(ctx, phoneNumber) {
    try {
        const response = await axios.get(
            `${config.apiUrl}/api/sms/conversation/${encodeURIComponent(phoneNumber)}`,
            { timeout: 15000 }
        );

        if (!response.data.success || !response.data.conversation) {
            return ctx.reply('❌ No conversation found with this number');
        }

        const conversation = response.data.conversation;
        const messages = conversation.messages;

        let conversationText =
            `💬 *SMS Conversation*\n\n` +
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
            const cleanMsg = msg.content.replace(/[*_`$begin:math:display$$end:math:display$()~>#+=|{}.!-]/g, '\\$&');
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
        const response = await axios.get(`${config.apiUrl}/api/sms/stats`, { timeout: 10000 });
        if (response.data.success) {
            const stats = response.data.statistics;
            const conversations = response.data.active_conversations;

            let statsText =
                `📊 *SMS Statistics*\n\n` +
                `💬 Active Conversations: ${stats.active_conversations}\n` +
                `⏰ Scheduled Messages: ${stats.scheduled_messages}\n` +
                `📱 Messages Today: ${stats.total_conversations_today}\n` +
                `📋 Queue Size: ${stats.message_queue_size}\n\n`;

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
        const response = await axios.get(`${config.apiUrl}/api/sms/templates`, { timeout: 10000 });
        if (response.data.success) {
            const templates = response.data.available_templates;
            let templatesText = `📝 *Available SMS Templates*\n\n`;
            templates.forEach((template, index) => {
                const displayName = template.replace(/_/g, ' ').toUpperCase();
                templatesText += `${index + 1}. ${displayName}\n`;
            });
            templatesText += `\n💡 Use /smstemplate <name> to see template content\nExample: /sms_template welcome`;
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
    bot.command('sms', async ctx => {
        try {
            const user = await new Promise(resolve => getUser(ctx.from.id, resolve));
            if (!user) return ctx.reply('❌ You are not authorized to use this bot.');
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
            if (!user) return ctx.reply('❌ You are not authorized to use this bot.');
            const adminStatus = await new Promise(resolve => isAdmin(ctx.from.id, resolve));
            if (!adminStatus) return ctx.reply('❌ Bulk SMS is for administrators only.');
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
            if (!user) return ctx.reply('❌ You are not authorized to use this bot.');
            await ctx.conversation.enter('schedule-sms-conversation');
        } catch (error) {
            console.error('Schedule SMS command error:', error);
            await ctx.reply('❌ Could not start SMS scheduling.');
        }
    });

    // SMS conversation command
    bot.command('smsconversation', async ctx => {
         try {
             // Check if user is authorized
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
                return ctx.reply('📱 Usage: /smsconversation <phone_number>\n\nExample: /sms_conversation +1234567890', {
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
    bot.command('smsstats', async ctx => {
        try {
            const user = await new Promise(resolve => getUser(ctx.from.id, resolve));
            if (!user) return ctx.reply('❌ You are not authorized to use this bot.');
            const adminStatus = await new Promise(resolve => isAdmin(ctx.from.id, resolve));
            if (!adminStatus) return ctx.reply('❌ SMS statistics are for administrators only.');
            await getSmsStats(ctx);
        } catch (error) {
            console.error('SMS stats command error:', error);
            await ctx.reply('❌ Error fetching SMS statistics.');
        }
    });

    // SMS templates command
    bot.command('smstemplates', async ctx => {
        try {
            // Check if user is authorized and is admin
            const user = await new Promise(r => getUser(ctx.from.id, r));
            if (!user) {
                return ctx.reply('❌ You are not authorized to use this bot.');
            }

            const adminStatus = await new Promise(r => isAdmin(ctx.from.id, r));
            if (!adminStatus) {
                return ctx.reply('❌ This command is for administrators only.');
            } 
            await showSmsTemplates(ctx);
        } catch (error) {
            console.error('SMS templates command error:', error);
            await ctx.reply('❌ Error fetching SMS templates.');
        }
    });

    // Individual template command
    bot.command('smstemplate', async ctx => {
        try {
            
            // Check if user is authorized and is admin
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
                return ctx.reply('📝 Usage: /smstemplate <template_name>\n\nExample: /sms_template welcome', {
                    parse_mode: 'Markdown'
                });
            }
            const templateName = args[1].trim();
            const variables =
                args.length > 2
                    ? JSON.stringify({ date: '2024-12-25', time: '14:30', code: '123456', amount: '$50.00' })
                    : '{}';
            const response = await axios.get(`${config.apiUrl}/api/sms/templates`, {
                params: { template_name: templateName, variables },
                timeout: 10000
            });
            if (response.data.success) {
                const templateText =
                    `📝 *Template: ${templateName.toUpperCase()}*\n\n` +
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
