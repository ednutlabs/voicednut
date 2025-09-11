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

            const webAppUrl = `${config.webAppUrl || 'https://your-domain.com/miniapp.html'}`;
            
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
            await ctx.reply('❌ Error opening Mini App. Please try again.');
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
            console.log('Received Mini App data:', webAppData);

            await handleMiniAppAction(ctx, webAppData, user);

        } catch (error) {
            console.error('Web App data error:', error);
            await ctx.reply('❌ Error processing Mini App request. Please try again.');
        }
    });

    // Add Mini App button to existing start command
    bot.use(async (ctx, next) => {
        // Add Mini App option to main menu responses
        if (ctx.message && ctx.message.text === '/start') {
            // This will be handled after the main start command
        }
        await next();
    });
};

// Handle different actions from Mini App
async function handleMiniAppAction(ctx, data, user) {
    const { action, ...params } = data;
    
    console.log(`Mini App action: ${action}`, params);

    switch (action) {
        case 'call':
            await handleMiniAppCall(ctx, params, user);
            break;
            
        case 'sms':
            await handleMiniAppSms(ctx, params, user);
            break;
            
        case 'get_stats':
            await handleMiniAppStats(ctx, user);
            break;
            
        case 'get_recent_activity':
            await handleMiniAppActivity(ctx, user);
            break;
            
        default:
            await ctx.reply('❌ Unknown Mini App action');
    }
}

// Handle call request from Mini App
async function handleMiniAppCall(ctx, params, user) {
    const { phone, prompt, first_message } = params;
    
    try {
        // Validate input
        if (!phone || !prompt || !first_message) {
            await ctx.answerWebAppQuery('❌ Missing required fields');
            return;
        }

        // Validate phone format
        const e164Regex = /^\+[1-9]\d{1,14}$/;
        if (!e164Regex.test(phone.trim())) {
            await ctx.answerWebAppQuery('❌ Invalid phone number format');
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

        console.log('Mini App call payload:', payload);

        const response = await axios.post(`${config.apiUrl}/outbound-call`, payload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 30000
        });

        if (response.data.success && response.data.call_sid) {
            // Send success response to Mini App
            await ctx.answerWebAppQuery(JSON.stringify({
                success: true,
                message: 'Call initiated successfully!',
                call_sid: response.data.call_sid,
                status: response.data.status
            }));

            // Also send regular message with details
            const successMsg = `✅ *Call Placed Successfully!*\n\n` +
                `📞 To: ${response.data.to}\n` +
                `🆔 Call SID: \`${response.data.call_sid}\`\n` +
                `📊 Status: ${response.data.status}\n\n` +
                `🔔 You'll receive notifications about call progress.`;

            await ctx.reply(successMsg, { parse_mode: 'Markdown' });
        } else {
            await ctx.answerWebAppQuery('❌ Call failed - unexpected response');
        }

    } catch (error) {
        console.error('Mini App call error:', error);
        
        let errorMsg = 'Call failed';
        if (error.response?.data?.error) {
            errorMsg = error.response.data.error;
        } else if (error.message) {
            errorMsg = error.message;
        }

        await ctx.answerWebAppQuery(`❌ ${errorMsg}`);
    }
}

// Handle SMS request from Mini App
async function handleMiniAppSms(ctx, params, user) {
    const { phone, message } = params;
    
    try {
        // Validate input
        if (!phone || !message) {
            await ctx.answerWebAppQuery('❌ Missing phone number or message');
            return;
        }

        // Basic phone validation
        if (!phone.startsWith('+') || phone.length < 10) {
            await ctx.answerWebAppQuery('❌ Invalid phone number format');
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
            await ctx.answerWebAppQuery(JSON.stringify({
                success: true,
                message: 'SMS sent successfully!',
                message_sid: response.data.message_sid
            }));

            const successMsg = `✅ *SMS Sent Successfully!*\n\n` +
                `📱 To: ${phone}\n` +
                `📄 Message: ${message.substring(0, 50)}${message.length > 50 ? '...' : ''}\n` +
                `🆔 Message SID: \`${response.data.message_sid}\``;

            await ctx.reply(successMsg, { parse_mode: 'Markdown' });
        } else {
            await ctx.answerWebAppQuery('❌ SMS failed - unexpected response');
        }

    } catch (error) {
        console.error('Mini App SMS error:', error);
        
        let errorMsg = 'SMS failed';
        if (error.response?.data?.error) {
            errorMsg = error.response.data.error;
        }

        await ctx.answerWebAppQuery(`❌ ${errorMsg}`);
    }
}

// Handle stats request from Mini App
async function handleMiniAppStats(ctx, user) {
    try {
        const axios = require('axios');
        
        // Get user stats (you may need to implement this endpoint)
        const response = await axios.get(`${config.apiUrl}/user-stats/${ctx.from.id}`, {
            timeout: 10000
        });

        const stats = response.data || { total_calls: 0, total_sms: 0, recent_activity: [] };
        
        await ctx.answerWebAppQuery(JSON.stringify({
            success: true,
            stats: stats
        }));

    } catch (error) {
        console.error('Mini App stats error:', error);
        // Return default stats if API fails
        await ctx.answerWebAppQuery(JSON.stringify({
            success: true,
            stats: { total_calls: 0, total_sms: 0, recent_activity: [] }
        }));
    }
}

// Handle recent activity request from Mini App
async function handleMiniAppActivity(ctx, user) {
    try {
        const axios = require('axios');
        
        // Get recent calls
        const callsResponse = await axios.get(`${config.apiUrl}/api/calls/list?limit=5&user_id=${ctx.from.id}`, {
            timeout: 10000
        });

        const calls = callsResponse.data.calls || [];
        
        // Format activity for Mini App
        const activity = calls.map(call => ({
            type: 'call',
            title: `Voice Call to ${call.phone_number}`,
            subtitle: `Duration: ${formatDuration(call.duration)} • ${call.status}`,
            time: formatTimeAgo(call.created_at),
            call_sid: call.call_sid
        }));

        await ctx.answerWebAppQuery(JSON.stringify({
            success: true,
            activity: activity
        }));

    } catch (error) {
        console.error('Mini App activity error:', error);
        await ctx.answerWebAppQuery(JSON.stringify({
            success: true,
            activity: []
        }));
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
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    
    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
}

// Add Mini App button to existing menus
function addMiniAppButton(keyboard) {
    return keyboard.row().webApp('🚀 Open Mini App', config.webAppUrl || 'https://your-domain.com/miniapp.html');
}