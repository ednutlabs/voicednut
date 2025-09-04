const config = require('../config');
const axios = require('axios');
const { getUser } = require('../db/db');
// Simple phone number validation to match E.164 format
function isValidPhoneNumber(number) {
    // Basic E.164 validation: starts with + followed by 1-15 digits
    const e164Regex = /^\+[1-9]\d{1,14}$/;
    return e164Regex.test(number.trim());
}

async function callFlow(conversation, ctx) {
    try {
        // Check if user is authorized
        const user = await new Promise(r => getUser(ctx.from.id, r));
        if (!user) {
            return ctx.reply('❌ You are not authorized to use this bot.');
        }

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
                `• AI-generated summary\n\n`;

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
}

module.exports = {
    callFlow,
    registerCallCommand
};
