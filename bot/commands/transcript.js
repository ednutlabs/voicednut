const config = require('../config');
const axios = require('axios');
const { getUser } = require('../db/db');

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
            return ctx.reply(`📋 *Call Details*\n\n📞 ${call.phone_number}\n🆔 \`${callSid}\`\n\n❌ No transcript available yet`, {
                parse_mode: 'Markdown'
            });
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

module.exports = (bot) => {
    // Transcript command
    bot.command('transcript', async (ctx) => {
        try {
            // Check if user is authorized
            const user = await new Promise(r => getUser(ctx.from.id, r));
            if (!user) {
                return ctx.reply('❌ You are not authorized to use this bot.');
            }

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
    bot.command('calls', async (ctx) => {
        try {
            // Check if user is authorized
            const user = await new Promise(r => getUser(ctx.from.id, r));
            if (!user) {
                return ctx.reply('❌ You are not authorized to use this bot.');
            }

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
};