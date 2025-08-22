// api/services/webhook-service.js
const axios = require('axios');

class WebhookService {
  constructor() {
    this.isRunning = false;
    this.interval = null;
    this.db = null;
    this.telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
    this.processInterval = 10000; // Check every 10 seconds
  }

  start(database) {
    this.db = database;
    
    if (!this.telegramBotToken) {
      console.warn('TELEGRAM_BOT_TOKEN not configured. Webhook service disabled.'.yellow);
      return;
    }

    if (this.isRunning) {
      console.log('Webhook service is already running');
      return;
    }

    this.isRunning = true;
    console.log('Starting webhook service...'.green);
    
    // Start processing notifications
    this.interval = setInterval(() => {
      this.processNotifications();
    }, this.processInterval);

    // Process immediately
    this.processNotifications();
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.isRunning = false;
    console.log('Webhook service stopped'.yellow);
  }

  async processNotifications() {
    if (!this.db || !this.telegramBotToken) return;

    // Check if database is properly initialized
    if (!this.db.isInitialized) {
      console.log('Database not yet initialized, skipping notification processing...');
      return;
    }

    try {
      const notifications = await this.db.getPendingWebhookNotifications();
      
      if (notifications.length === 0) return;

      console.log(`Processing ${notifications.length} pending notifications`.blue);

      for (const notification of notifications) {
        try {
          await this.sendNotification(notification);
        } catch (error) {
          console.error(`Failed to send notification ${notification.id}:`, error.message);
        }
      }
    } catch (error) {
      console.error('Error processing notifications:', error);
    }
  }

  async sendNotification(notification) {
    const { id, call_sid, notification_type, telegram_chat_id, phone_number, call_summary, ai_analysis } = notification;

    try {
      let message = '';
      let parseMode = 'Markdown';

      switch (notification_type) {
        case 'call_initiated':
          message = this.formatCallInitiatedMessage(call_sid, phone_number);
          break;
        case 'call_completed':
          message = this.formatCallCompletedMessage(call_sid, phone_number, call_summary, ai_analysis);
          break;
        case 'call_summary':
          message = await this.formatCallSummaryMessage(call_sid, phone_number);
          break;
        default:
          throw new Error(`Unknown notification type: ${notification_type}`);
      }

      // Send to Telegram
      await this.sendTelegramMessage(telegram_chat_id, message, parseMode);

      // Mark as sent
      await this.db.updateWebhookNotification(id, 'sent', null, new Date().toISOString());
      
      console.log(`✅ Sent ${notification_type} notification for call ${call_sid}`.green);

    } catch (error) {
      console.error(`❌ Failed to send notification ${id}:`, error.message);
      
      // Mark as failed
      await this.db.updateWebhookNotification(id, 'failed', error.message, null);
    }
  }

  formatCallInitiatedMessage(call_sid, phone_number) {
    return `🔔 *Call Initiated*\n\n` +
           `📞 Number: ${phone_number}\n` +
           `🆔 Call ID: \`${call_sid}\`\n` +
           `⏰ Time: ${new Date().toLocaleString()}\n\n` +
           `*Status: Connecting...*`;
  }

  formatCallCompletedMessage(call_sid, phone_number, call_summary, ai_analysis) {
    let analysis = {};
    try {
      analysis = JSON.parse(ai_analysis || '{}');
    } catch (e) {
      analysis = {};
    }

    const duration = analysis.duration_seconds ? 
      `${Math.floor(analysis.duration_seconds / 60)}:${String(analysis.duration_seconds % 60).padStart(2, '0')}` : 
      'Unknown';

    return `✅ *Call Completed*\n\n` +
           `📞 Number: ${phone_number}\n` +
           `🆔 Call ID: \`${call_sid}\`\n` +
           `⏱️ Duration: ${duration}\n` +
           `💬 Messages: ${analysis.total_messages || 0}\n` +
           `🔄 Turns: ${analysis.conversation_turns || 0}\n\n` +
           `📝 *Summary:*\n${call_summary || 'No summary available'}\n\n` +
           `Use /transcript ${call_sid} to get full transcript`;
  }

  async formatCallSummaryMessage(call_sid, phone_number) {
    try {
      // Get full transcripts for detailed summary
      const transcripts = await this.db.getCallTranscripts(call_sid);
      
      if (!transcripts || transcripts.length === 0) {
        return `📋 *Call Transcript*\n\n` +
               `📞 Number: ${phone_number}\n` +
               `🆔 Call ID: \`${call_sid}\`\n\n` +
               `❌ No transcript available`;
      }

      let transcriptText = `📋 *Call Transcript*\n\n`;
      transcriptText += `📞 Number: ${phone_number}\n`;
      transcriptText += `🆔 Call ID: \`${call_sid}\`\n`;
      transcriptText += `💬 Total Messages: ${transcripts.length}\n\n`;
      transcriptText += `*Conversation:*\n\n`;

      // Format transcript with speaker labels
      for (let i = 0; i < Math.min(transcripts.length, 20); i++) { // Limit to first 20 messages
        const t = transcripts[i];
        const speaker = t.speaker === 'user' ? '👤 User' : '🤖 AI';
        const time = new Date(t.timestamp).toLocaleTimeString();
        
        transcriptText += `${speaker} (${time}):\n`;
        transcriptText += `_${t.message}_\n\n`;
      }

      if (transcripts.length > 20) {
        transcriptText += `... and ${transcripts.length - 20} more messages\n\n`;
        transcriptText += `Use /fullTranscript ${call_sid} for complete transcript`;
      }

      // Telegram message limit is 4096 characters
      if (transcriptText.length > 4000) {
        transcriptText = transcriptText.substring(0, 3900) + '\n\n... (truncated)\n\nUse /fullTranscript for complete transcript';
      }

      return transcriptText;

    } catch (error) {
      console.error('Error formatting call summary:', error);
      return `📋 *Call Summary*\n\n` +
             `📞 Number: ${phone_number}\n` +
             `🆔 Call ID: \`${call_sid}\`\n\n` +
             `❌ Error generating summary: ${error.message}`;
    }
  }

  async sendTelegramMessage(chatId, message, parseMode = 'Markdown') {
    const url = `https://api.telegram.org/bot${this.telegramBotToken}/sendMessage`;
    
    const payload = {
      chat_id: chatId,
      text: message,
      parse_mode: parseMode,
      disable_web_page_preview: true
    };

    const response = await axios.post(url, payload, {
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.data.ok) {
      throw new Error(`Telegram API error: ${response.data.description}`);
    }

    return response.data;
  }

  // Method to send immediate notification (not queued)
  async sendImmediateNotification(call_sid, notification_type, telegram_chat_id, additionalData = {}) {
    try {
      const callDetails = await this.db.getCall(call_sid);
      if (!callDetails) {
        throw new Error('Call not found');
      }

      const notification = {
        id: Date.now(), // Temporary ID
        call_sid,
        notification_type,
        telegram_chat_id,
        phone_number: callDetails.phone_number,
        call_summary: callDetails.call_summary,
        ai_analysis: callDetails.ai_analysis,
        ...additionalData
      };

      await this.sendNotification(notification);
      return true;
    } catch (error) {
      console.error('Failed to send immediate notification:', error);
      return false;
    }
  }

  // Health check method
  async healthCheck() {
    if (!this.telegramBotToken) {
      return { status: 'disabled', reason: 'No Telegram bot token configured' };
    }

    try {
      const url = `https://api.telegram.org/bot${this.telegramBotToken}/getMe`;
      const response = await axios.get(url, { timeout: 5000 });
      
      if (response.data.ok) {
        return {
          status: 'healthy',
          bot_info: {
            username: response.data.result.username,
            first_name: response.data.result.first_name
          },
          is_running: this.isRunning
        };
      } else {
        return { status: 'error', reason: 'Telegram API returned error' };
      }
    } catch (error) {
      return { status: 'error', reason: error.message };
    }
  }
}

// Export singleton instance
const webhookService = new WebhookService();
module.exports = { webhookService };