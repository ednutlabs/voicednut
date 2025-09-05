const config = require('../config');
const axios = require('axios');
const { getUser, isAdmin } = require('../db/db');

// Function to escape Telegram Markdown special characters
function escapeMarkdown(text) {
  if (!text) return '';
  // Escape special Markdown characters that could break parsing
  return text
    .replace(/\\/g, '\\\\')  // Escape backslashes first
    .replace(/\*/g, '\\*')   // Escape asterisks
    .replace(/_/g, '\\_')    // Escape underscores
    .replace(/\[/g, '\\[')   // Escape square brackets
    .replace(/\]/g, '\\]')   // Escape square brackets
    .replace(/\(/g, '\\(')   // Escape parentheses
    .replace(/\)/g, '\\)')   // Escape parentheses
    .replace(/~/g, '\\~')    // Escape tildes
    .replace(/`/g, '\\`')    // Escape backticks
    .replace(/>/g, '\\>')    // Escape greater than
    .replace(/#/g, '\\#')    // Escape hash
    .replace(/\+/g, '\\+')   // Escape plus
    .replace(/-/g, '\\-')    // Escape minus
    .replace(/=/g, '\\=')    // Escape equals
    .replace(/\|/g, '\\|')   // Escape pipes
    .replace(/\{/g, '\\{')   // Escape curly braces
    .replace(/\}/g, '\\}')   // Escape curly braces
    .replace(/\./g, '\\.')   // Escape dots
    .replace(/!/g, '\\!');   // Escape exclamation marks
}

// Function to get call transcript
async function getTranscript(ctx, callSid) {
  try {
    console.log(`Fetching transcript for call: ${callSid}`);
    const response = await axios.get(`${config.apiUrl}/api/calls/${callSid}`, {
      timeout: 15000
    });

    const { call, transcripts } = response.data;

    if (!call) {
      return ctx.reply('❌ Call not found');
    }

    if (!transcripts || transcripts.length === 0) {
      return ctx.reply(`📋 *Call Details*\n\n📞 ${escapeMarkdown(call.phone_number)}\n🆔 \`${callSid}\`\n📊 Status: ${escapeMarkdown(call.status || 'Unknown')}\n\n❌ No transcript available yet`, {
        parse_mode: 'Markdown'
      });
    }

    // Format transcript with proper escaping
    let message = `📋 *Call Transcript*\n\n`;
    message += `📞 Number: ${escapeMarkdown(call.phone_number)}\n`;
    message += `⏱️ Duration: ${call.duration ? Math.floor(call.duration/60) + ':' + String(call.duration%60).padStart(2,'0') : 'Unknown'}\n`;
    message += `📊 Status: ${escapeMarkdown(call.status || 'Unknown')}\n`;
    message += `💬 Messages: ${transcripts.length}\n\n`;

    if (call.call_summary) {
      message += `📝 *Summary:*\n${escapeMarkdown(call.call_summary)}\n\n`;
    }

    message += `*Conversation:*\n`;

    // Add transcript messages (limit to avoid Telegram message limit)
    const maxMessages = 10; // Reduced to prevent message length issues
    for (let i = 0; i < Math.min(transcripts.length, maxMessages); i++) {
      const t = transcripts[i];
      const speaker = t.speaker === 'user' ? '👤' : '🤖';
      const time = new Date(t.timestamp).toLocaleTimeString();

      // Escape the transcript message content
      const escapedMessage = escapeMarkdown(t.message);
      
      message += `\n${speaker} _\\(${time}\\)_\n${escapedMessage}\n`;
    }

    if (transcripts.length > maxMessages) {
      message += `\n\\.\\.\\. and ${transcripts.length - maxMessages} more messages`;
    }

    // Check message length and truncate if needed (Telegram limit is 4096)
    if (message.length > 3800) {
      message = message.substring(0, 3700) + '\n\n\\.\\.\\. \\(truncated\\)\n\nUse /fullTranscript for complete transcript';
    }

    await ctx.reply(message, { parse_mode: 'Markdown' });

  } catch (error) {
    console.error('Error fetching transcript:', error);

    if (error.response?.status === 404) {
      await ctx.reply('❌ Call not found or transcript not available yet');
    } else if (error.name === 'GrammyError' && error.description?.includes('parse entities')) {
      // If there's still a parsing error, send without markdown
      await ctx.reply(`❌ Error displaying transcript due to formatting issues. Call SID: ${callSid}\n\nPlease contact support for assistance.`);
    } else {
      await ctx.reply('❌ Error fetching transcript. Please try again later.');
    }
  }
}

// Function to get calls list with better formatting
async function getCallsList(ctx, limit = 10) {
    // Use the correct API endpoint structure
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


module.exports = (bot) => {
  // Transcript command
  bot.command('transcript', async (ctx) => {
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
        return ctx.reply('📋 Usage: /transcript <call\\_sid>\n\nExample: /transcript CA1234567890abcdef', {
          parse_mode: 'Markdown'
        });
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

            const adminStatus = await new Promise(r => isAdmin(ctx.from.id, r));
            if (!adminStatus) {
                return ctx.reply('❌ This command is for administrators only.');
            }

      const args = ctx.message.text.split(' ');
      const limit = args.length > 1 ? parseInt(args[1]) || 10 : 10;
      
      if (limit > 50) {
        return ctx.reply('❌ Limit cannot exceed 50 calls');
      }

      if (limit < 1) {
        return ctx.reply('❌ Limit must be at least 1');
      }

      await ctx.reply('📋 Fetching recent calls...');
      await getCallsList(ctx, limit);
    } catch (error) {
      console.error('Calls command error:', error);
      await ctx.reply('❌ Error fetching calls list');
    }
  });

  // Full transcript command for longer transcripts
  bot.command('fullTranscript', async (ctx) => {
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
        return ctx.reply('📋 Usage: /fullTranscript <call\\_sid>', {
          parse_mode: 'Markdown'
        });
      }

      const callSid = args[1].trim();
      
      if (!callSid.startsWith('CA')) {
        return ctx.reply('❌ Invalid Call SID format. Should start with "CA"');
      }

      await ctx.reply('📋 Fetching full transcript...');

      // Send without markdown to avoid parsing issues
      const response = await axios.get(`${config.apiUrl}/api/calls/${callSid}`, {
        timeout: 15000
      });

      const { call, transcripts } = response.data;

      if (!call || !transcripts || transcripts.length === 0) {
        return ctx.reply('❌ Call or transcript not found');
      }

      // Send as plain text to avoid markdown issues
      let plainMessage = `📋 FULL CALL TRANSCRIPT\n\n`;
      plainMessage += `📞 Number: ${call.phone_number}\n`;
      plainMessage += `🆔 Call ID: ${callSid}\n`;
      plainMessage += `⏱️ Duration: ${call.duration ? Math.floor(call.duration/60) + ':' + String(call.duration%60).padStart(2,'0') : 'Unknown'}\n`;
      plainMessage += `📊 Status: ${call.status || 'Unknown'}\n`;
      plainMessage += `💬 Messages: ${transcripts.length}\n\n`;

      plainMessage += `CONVERSATION:\n`;

      transcripts.forEach((t, index) => {
        const speaker = t.speaker === 'user' ? '👤 USER' : '🤖 AI';
        const time = new Date(t.timestamp).toLocaleTimeString();
        plainMessage += `\n${speaker} (${time}):\n${t.message}\n`;
      });

      // Split into chunks if too long
      const chunks = [];
      let currentChunk = plainMessage;
      
      while (currentChunk.length > 4000) {
        let splitIndex = currentChunk.lastIndexOf('\n', 4000);
        if (splitIndex === -1) splitIndex = 4000;
        
        chunks.push(currentChunk.substring(0, splitIndex));
        currentChunk = currentChunk.substring(splitIndex);
      }
      
      if (currentChunk.length > 0) {
        chunks.push(currentChunk);
      }

      // Send chunks
      for (let i = 0; i < chunks.length; i++) {
        await ctx.reply(chunks[i] + (i < chunks.length - 1 ? '\n\n... (continued)' : ''));
        // Add delay between messages to avoid rate limiting
        if (i < chunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

    } catch (error) {
      console.error('Full transcript error:', error);
      if (error.response?.status === 404) {
        await ctx.reply('❌ Call not found');
      } else {
        await ctx.reply('❌ Error fetching full transcript');
      }
    }
  });
};
