const { InlineKeyboard } = require('grammy');
const { getUser, isAdmin } = require('../db/db');
const crypto = require('crypto');
const config = require('../config');

// Store pending operations from Mini App
const pendingOperations = new Map();

module.exports = (bot) => {
    // Command to open Mini App
    bot.command('app', async (ctx) => {
        try {
            const user = await new Promise(r => getUser(ctx.from.id, r));
            if (!user) {
                return ctx.reply('❌ You are not authorized to use this bot.');
            }

            // Use the Vercel deployment URL or fallback to config
            const webAppUrl = process.env.WEBAPP_URL || config.webAppUrl || 'https://your-vercel-app.vercel.app/miniapp.html';
            
            console.log('Opening Mini App for user:', ctx.from.id, 'URL:', webAppUrl);
            
            const keyboard = new InlineKeyboard()
                .webApp('🚀 Open Voicednut App', webAppUrl);

            await ctx.reply(
                '🎙️ *Voicednut Bot Mini App*\n\n' +
                'Click the button below to open the enhanced interface with:\n' +
                '• 📞 Easy voice call setup\n' +
                '• 💬 SMS messaging\n' +
                '• 📊 Activity tracking\n' +
                '• 🎨 Beautiful user interface\n\n' +
                '_The Mini App provides a much better experience than regular bot commands._',
                { 
                    parse_mode: 'Markdown',
                    reply_markup: keyboard 
                }
            );
        } catch (error) {
            console.error('WebApp command error:', error);
            await ctx.reply('❌ Error opening Mini App. Please try again later.');
        }
    });

    // Handle web app data from Mini App
    bot.on('message:web_app_data', async (ctx) => {
        try {
            const user = await new Promise(r => getUser(ctx.from.id, r));
            if (!user) {
                return ctx.reply('❌ You are not authorized to use this bot.');
            }

            const webAppData = JSON.parse(ctx.message.web_app_data.data);
            console.log('Received Mini App data from user', ctx.from.id, ':', webAppData);

            await handleMiniAppAction(ctx, webAppData, user);

        } catch (error) {
            console.error('Web App data error:', error);
            await ctx.reply('❌ Error processing Mini App request. Please try again.');
        }
    });

    // Add Mini App button to existing start command response
    bot.use(async (ctx, next) => {
        // This middleware can add Mini App buttons to other responses if needed
        await next();
    });
};

// Handle different actions from Mini App
async function handleMiniAppAction(ctx, data, user) {
    const { action, result, ...params } = data;
    
    console.log(`Mini App action from user ${ctx.from.id}: ${action}`, params);

    switch (action) {
        case 'call':
            if (result === 'success') {
                await ctx.reply(`✅ Call initiated successfully!\n🆔 Call SID: \`${params.call_sid}\`\n\n🔔 You'll receive notifications about call progress.`, 
                    { parse_mode: 'Markdown' });
            } else {
                await handleMiniAppCall(ctx, params, user);
            }
            break;
            
        case 'sms':
            if (result === 'success') {
                await ctx.reply(`✅ SMS sent successfully!\n🆔 Message SID: \`${params.message_sid}\``, 
                    { parse_mode: 'Markdown' });
            } else {
                await handleMiniAppSms(ctx, params, user);
            }
            break;
            
        case 'get_stats':
            await handleMiniAppStats(ctx, user);
            break;
            
        case 'get_recent_activity':
            await handleMiniAppActivity(ctx, user);
            break;
            
        default:
            console.warn('Unknown Mini App action:', action);
            await ctx.reply('❌ Unknown Mini App action received.');
    }
}

// Handle call request from Mini App (fallback if API call failed)
async function handleMiniAppCall(ctx, params, user) {
    const { phone, prompt, first_message } = params;
    
    try {
        // Validate input
        if (!phone || !prompt || !first_message) {
            await ctx.reply('❌ Missing required fields for call');
            return;
        }

        // Validate phone format
        const e164Regex = /^\+[1-9]\d{1,14}$/;
        if (!e164Regex.test(phone.trim())) {
            await ctx.reply('❌ Invalid phone number format');
            return;
        }

        // Make the API call (using existing call logic)
        const axios = require('axios');
        const payload = {
            number: phone,
            prompt: prompt,
            first_message: first_message,
            user_chat_id: ctx.from.id.toString()
        };

        console.log('Mini App fallback call payload:', payload);

        const response = await axios.post(`${config.apiUrl}/outbound-call`, payload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 30000
        });

        if (response.data.success && response.data.call_sid) {
            const successMsg = `✅ *Call Placed Successfully via Bot!*\n\n` +
                `📞 To: ${response.data.to}\n` +
                `🆔 Call SID: \`${response.data.call_sid}\`\n` +
                `📊 Status: ${response.data.status}\n\n` +
                `🔔 You'll receive notifications about call progress.`;

            await ctx.reply(successMsg, { parse_mode: 'Markdown' });
        } else {
            await ctx.reply('❌ Call failed - unexpected response from API');
        }

    } catch (error) {
        console.error('Mini App fallback call error:', error);
        
        let errorMsg = 'Call failed';
        if (error.response?.data?.error) {
            errorMsg = error.response.data.error;
        } else if (error.message) {
            errorMsg = error.message;
        }

        await ctx.reply(`❌ ${errorMsg}`);
    }
}

// Handle SMS request from Mini App (fallback if API call failed)
async function handleMiniAppSms(ctx, params, user) {
    const { phone, message } = params;
    
    try {
        // Validate input
        if (!phone || !message) {
            await ctx.reply('❌ Missing phone number or message');
            return;
        }

        // Basic phone validation
        if (!phone.startsWith('+') || phone.length < 10) {
            await ctx.reply('❌ Invalid phone number format');
            return;
        }

        // Make SMS API call
        const axios = require('axios');
        const payload = {
            to: phone,
            message: message,
            user_chat_id: ctx.from.id.toString()
        };

        const response = await axios.post(`${config.apiUrl}/send-sms`, payload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 30000
        });

        if (response.data.success) {
            const successMsg = `✅ *SMS Sent Successfully via Bot!*\n\n` +
                `📱 To: ${phone}\n` +
                `📄 Message: ${message.substring(0, 50)}${message.length > 50 ? '...' : ''}\n` +
                `🆔 Message SID: \`${response.data.message_sid}\``;

            await ctx.reply(successMsg, { parse_mode: 'Markdown' });
        } else {
            await ctx.reply('❌ SMS failed - unexpected response from API');
        }

    } catch (error) {
        console.error('Mini App fallback SMS error:', error);
        
        let errorMsg = 'SMS failed';
        if (error.response?.data?.error) {
            errorMsg = error.response.data.error;
        }

        await ctx.reply(`❌ ${errorMsg}`);
    }
}

// Handle stats request from Mini App
async function handleMiniAppStats(ctx, user) {
    try {
        const axios = require('axios');
        
        // Get user stats from API
        const response = await axios.get(`${config.apiUrl}/user-stats/${ctx.from.id}`, {
            timeout: 10000
        });

        const stats = response.data || { total_calls: 0, total_sms: 0, recent_activity: [] };
        
        // Format stats message
        let statsMsg = `📊 *Your Statistics*\n\n`;
        statsMsg += `📞 Total Calls: ${stats.total_calls || 0}\n`;
        statsMsg += `💬 Total SMS: ${stats.total_sms || 0}\n`;
        statsMsg += `📈 This Month: ${stats.this_month_calls || 0} calls, ${stats.this_month_sms || 0} SMS\n`;
        statsMsg += `✅ Success Rate: ${stats.success_rate || 0}%\n`;
        
        if (stats.last_activity) {
            statsMsg += `🕐 Last Activity: ${formatTimeAgo(stats.last_activity)}\n`;
        }
        
        await ctx.reply(statsMsg, { parse_mode: 'Markdown' });

    } catch (error) {
        console.error('Mini App stats error:', error);
        await ctx.reply('📊 Statistics: 0 calls, 0 SMS (Unable to load detailed stats)');
    }
}

// Handle recent activity request from Mini App
async function handleMiniAppActivity(ctx, user) {
    try {
        const axios = require('axios');
        
        // Get recent calls and activity
        const response = await axios.get(`${config.apiUrl}/api/calls/list?limit=5&user_id=${ctx.from.id}`, {
            timeout: 10000
        });

        const calls = response.data.calls || [];
        
        if (calls.length === 0) {
            await ctx.reply('📋 No recent activity found.');
            return;
        }
        
        // Format activity message
        let activityMsg = `📋 *Recent Activity*\n\n`;
        
        calls.forEach((call, index) => {
            const status = call.status === 'completed' ? '✅' : 
                          call.status === 'failed' ? '❌' : 
                          call.status === 'busy' ? '📵' : '⏳';
            
            activityMsg += `${index + 1}. ${status} Call to ${call.phone_number}\n`;
            activityMsg += `   Duration: ${formatDuration(call.duration)} • ${formatTimeAgo(call.created_at)}\n`;
            if (call.call_sid) {
                activityMsg += `   SID: \`${call.call_sid.substring(0, 20)}...\`\n`;
            }
            activityMsg += `\n`;
        });

        await ctx.reply(activityMsg, { parse_mode: 'Markdown' });

    } catch (error) {
        console.error('Mini App activity error:', error);
        await ctx.reply('📋 Unable to load recent activity. Use /calls to see call history.');
    }
}

// Utility functions
function formatDuration(seconds) {
    if (!seconds) return 'N/A';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
}

function formatTimeAgo(dateString) {
    if (!dateString) return 'Unknown';
    
    try {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        
        if (diffHours < 1) return 'Just now';
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffHours < 48) return 'Yesterday';
        return date.toLocaleDateString();
    } catch (error) {
        return 'Unknown';
    }
}

// Add Mini App button to existing menus (utility function)
function addMiniAppButton(keyboard) {
    const webAppUrl = process.env.WEBAPP_URL || config.webAppUrl || 'https://your-vercel-app.vercel.app/miniapp.html';
    return keyboard.row().webApp('🚀 Open Mini App', webAppUrl);
}

module.exports.addMiniAppButton = addMiniAppButton;