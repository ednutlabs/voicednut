// bot/commands/call.js

const config = require('../config');
const axios = require('axios');

// Simple phone number validation to match E.164 format
function isValidPhoneNumber(number) {
// Basic E.164 validation: starts with + followed by 1-15 digits
    const e164Regex = /^\+[1-9]\d{1,14}$/;
    return e164Regex.test(number.trim());
}

async function callFlow(conversation, ctx) {

try {
// Step 1: Get phone number
await ctx.reply('📞 Enter phone number (E.164 format, e.g., +16125151442):');


    const numMsg = await conversation.wait();
    const number = numMsg?.message?.text?.trim();

    if (!number) {
        return ctx.reply('❌ Please provide a phone number.');
    }

    if (!isValidPhoneNumber(number)) {
        return ctx.reply('❌ Invalid phone number format. Use E.164 format: +16125151442');
    }

    // Step 2: Get agent prompt
    await ctx.reply('✍️ Enter the agent prompt (describe how the AI should behave):');
    
    const promptMsg = await conversation.wait();
    const prompt = promptMsg?.message?.text?.trim();

    if (!prompt) {
        return ctx.reply('❌ Please provide a valid prompt.');
    }

    // Step 3: Get first message
    await ctx.reply('💬 Enter the first message the agent will say:');
    
    const firstMsg = await conversation.wait();
    const first_message = firstMsg?.message?.text?.trim();

    if (!first_message) {
        return ctx.reply('❌ Please provide a valid first message.');
    }

    // Step 4: Show confirmation
    const confirmText = `📋 *Call Details:*\n\n` +
        `📞 Number: ${number}\n` +
        `🤖 Prompt: ${prompt.substring(0, 80)}${prompt.length > 80 ? '...' : ''}\n` +
        `💬 First Message: ${first_message}\n\n` +
        `⏳ Making the call...`;

    await ctx.reply(confirmText, { parse_mode: 'Markdown' });

    // Step 5: Prepare payload with user chat ID for database tracking
    const payload = {
        number: number,
        prompt: prompt,
        first_message: first_message,
        user_chat_id: ctx.from.id.toString() // Add user chat ID for webhook notifications
    };

    console.log('Sending payload to API:', {
        ...payload,
        user_chat_id: payload.user_chat_id,
        prompt: payload.prompt.substring(0, 50) + '...'
    });

    // Step 6: Make the API call
    const response = await axios.post(`${config.apiUrl}/outbound-call`, payload, {
        headers: {
            'Content-Type': 'application/json'
        },
        timeout: 30000 // 30 second timeout
    });

    console.log('API Response:', response.data);

    // Step 7: Handle response
    if (response.data.success && response.data.call_sid) {
        const successMsg = `✅ *Call Placed Successfully!*\n\n` +
            `📞 To: ${response.data.to}\n` +
            `🆔 Call SID: \`${response.data.call_sid}\`\n` +
            `📊 Status: ${response.data.status}\n\n` +
            `🔔 *You'll receive notifications about:*\n` +
            `• Call progress updates\n` +
            `• Complete transcript when call ends\n` +
            `• AI-generated summary\n\n` +
            `Use /transcript ${response.data.call_sid} to get transcript later`;

        await ctx.reply(successMsg, { parse_mode: 'Markdown' });
        } else {
            await ctx.reply('⚠️ Call was sent but response format unexpected. Check logs.');
        }

    } catch (error) {
    console.error('Call error details:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        config: {
            url: error.config?.url,
            method: error.config?.method,
            headers: error.config?.headers
        }
    });

    let errorMsg = '❌ *Call Failed*\n\n';

    if (error.response) {
        // Server responded with error
        const status = error.response.status;
        const errorData = error.response.data;

        if (status === 400) {
            errorMsg += `Bad Request: ${errorData?.error || 'Invalid data sent'}`;
        } else if (status === 500) {
            errorMsg += `Server Error: ${errorData?.error || 'Internal server error'}`;
        } else {
            errorMsg += `HTTP ${status}: ${errorData?.error || error.response.statusText}`;
        }
    } else if (error.request) {
        // Network error
        errorMsg += `Network Error: Cannot reach API server\nURL: ${config.apiUrl}`;
    } else {
        // Other error
        errorMsg += `Error: ${error.message}`;
    }

        await ctx.reply(errorMsg, { parse_mode: 'Markdown' });
    }

}

// Function to get call transcript


async function getTranscript(ctx, callSid) {
    try {
        const response = await axios.get(`${config.apiUrl}/api/calls/${callSid}`, {
            timeout: 15000
        });

        const { call, transcripts } = response.data;

        if (!call) {
            return ctx.reply('❌ Call not found');
        }

        if (!transcripts || transcripts.length === 0) {
            return ctx.reply(`📋 *Call Details*\n\n📞 ${call.phone_number}\n🆔 \`${callSid}\`\n\n❌ No transcript available yet`);
        }

        // Format transcript
        let message = `📋 *Call Transcript*\n\n`;
        message += `📞 Number: ${call.phone_number}\n`;
        message += `⏱️ Duration: ${call.duration ? Math.floor(call.duration/60) + ':' + String(call.duration%60).padStart(2,'0') : 'Unknown'}\n`;
        message += `📊 Status: ${call.status}\n`;
        message += `💬 Messages: ${transcripts.length}\n\n`;

        if (call.call_summary) {
            message += `📝 *Summary:*\n${call.call_summary}\n\n`;
        }

        message += `*Conversation:*\n`;

        // Add transcript messages (limit to avoid Telegram message limit)
        const maxMessages = 15;
        for (let i = 0; i < Math.min(transcripts.length, maxMessages); i++) {
            const t = transcripts[i];
            const speaker = t.speaker === 'user' ? '👤' : '🤖';
            const time = new Date(t.timestamp).toLocaleTimeString();

            message += `\n${speaker} _(${time})_\n${t.message}\n`;
        }

        if (transcripts.length > maxMessages) {
            message += `\n... and ${transcripts.length - maxMessages} more messages`;
        }

        // Check message length (Telegram limit is 4096)
        if (message.length > 4000) {
            message = message.substring(0, 3900) + '\n\n... (truncated)';
        }

        await ctx.reply(message, { parse_mode: 'Markdown' });

    } catch (error) {
        console.error('Error fetching transcript:', error);

        if (error.response?.status === 404) {
            await ctx.reply('❌ Call not found or transcript not available yet');
        } else {
            await ctx.reply('❌ Error fetching transcript. Please try again later.');
        }
    }

}

// Function to get calls list


async function getCallsList(ctx, limit = 10) {
    try {
        const response = await axios.get(`${config.apiUrl}/api/calls?limit=${limit}`, {
            timeout: 15000
        });

        const { calls } = response.data;

        if (!calls || calls.length === 0) {
            return ctx.reply('📋 No calls found');
        }

        let message = `📋 *Recent Calls* (${calls.length})\n\n`;

        calls.forEach((call, index) => {
            const date = new Date(call.created_at).toLocaleDateString();
            const duration = call.duration ? `${Math.floor(call.duration/60)}:${String(call.duration%60).padStart(2,'0')}` : 'N/A';
            const status = call.status || 'Unknown';

            message += `${index + 1}. 📞 ${call.phone_number}\n`;
            message += `   🆔 \`${call.call_sid}\`\n`;
            message += `   📅 ${date} | ⏱️ ${duration} | 📊 ${status}\n`;
            message += `   💬 ${call.transcript_count || 0} messages\n\n`;
        });

        message += `Use /transcript <call_sid> to view details`;

        await ctx.reply(message, { parse_mode: 'Markdown' });

    } catch (error) {
        console.error('Error fetching calls list:', error);
        await ctx.reply('❌ Error fetching calls list. Please try again later.');
    }

}

function registerCallCommand(bot) {
    // Main call command
    bot.command('call', async (ctx) => {
try {
console.log(`Call command started by user ${ctx.from?.id || 'unknown'}`);
await ctx.conversation.enter("call-conversation");
} catch (error) {
    console.error('Error starting call conversation:', error);
await ctx.reply('❌ Could not start call process. Please try again.');
}
});


// Transcript command
    // Transcript command
    bot.command('transcript', async (ctx) => {
    try {
        const args = ctx.message.text.split(' ');
        
        if (args.length < 2) {
            return ctx.reply('📋 Usage: /transcript <call_sid>\n\nExample: /transcript CA1234567890abcdef');
        }

        const callSid = args[1].trim();
        
        if (!callSid.startsWith('CA')) {
            return ctx.reply('❌ Invalid Call SID format. Should start with "CA"');
        }

        await getTranscript(ctx, callSid);
    } catch (error) {
        console.error('Transcript command error:', error);
        await ctx.reply('❌ Error processing transcript command');
    }
    });

// Calls list command
    // Calls list command
    bot.command('calls', async (ctx) => {
    try {
        const args = ctx.message.text.split(' ');
        const limit = args.length > 1 ? parseInt(args[1]) || 10 : 10;
        
        if (limit > 50) {
            return ctx.reply('❌ Limit cannot exceed 50 calls');
        }

        await getCallsList(ctx, limit);
    } catch (error) {
        console.error('Calls command error:', error);
        await ctx.reply('❌ Error fetching calls list');
    }
    });

// API test command (enhanced)
    // API test command (enhanced)
    bot.command('test_api', async (ctx) => {
    try {
        console.log('Testing API connection to:', config.apiUrl);
        const response = await axios.get(`${config.apiUrl}/health`, {
            timeout: 10000
        });
        
        const health = response.data;
        
        let message = `✅ *API Status: ${health.status}*\n\n`;
        message += `🔗 URL: ${config.apiUrl}\n`;
        message += `📊 Active Calls: ${health.active_calls || 0}\n`;
        message += `📋 Recent Calls: ${health.recent_calls || 0}\n`;
        message += `🗄️ Database: ${health.database_connected ? '✅ Connected' : '❌ Disconnected'}\n`;
        message += `⏰ Timestamp: ${new Date(health.timestamp).toLocaleString()}`;
        
        await ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (error) {
        console.error('API test failed:', error.message);
        await ctx.reply(`❌ *API Test Failed*\n\nURL: ${config.apiUrl}\nError: ${error.message}`, { parse_mode: 'Markdown' });
    }
});

}
module.exports = {
callFlow,
registerCallCommand,
getTranscript,
getCallsList
};