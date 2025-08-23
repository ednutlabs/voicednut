const axios = require('axios');

class WebhookService {
  constructor() {
    this.isRunning = false;
    this.interval = null;
    this.db = null;
    this.telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
    this.processInterval = 5000; // Check every 5 seconds for faster updates
    this.activeCallStatus = new Map(); // Track call status to avoid duplicate messages
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
    this.activeCallStatus.clear();
    console.log('Webhook service stopped'.yellow);
  }

  async processNotifications() {
    if (!this.db || !this.telegramBotToken) return;

    if (!this.db.isInitialized) {
      return;
    }

    try {
      const notifications = await this.db.getPendingWebhookNotifications();
      
      if (notifications.length === 0) return;

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

  // Main method to send professional status updates
  async sendCallStatusUpdate(call_sid, status, telegram_chat_id, additionalData = {}) {
    try {
      // Prevent duplicate status messages
      const statusKey = `${call_sid}_${status}`;
      if (this.activeCallStatus.has(statusKey)) {
        return;
      }
      this.activeCallStatus.set(statusKey, true);

      let message = '';
      
      switch (status.toLowerCase()) {
        case 'queued':
        case 'initiated':
          message = '📞 Calling...';
          break;
        case 'ringing':
          message = '🔔 Ringing...';
          break;
        case 'in-progress':
        case 'answered':
          message = '✅ Answered...';
          break;
        case 'completed':
          message = '🔄 Completed...';
          break;
        case 'busy':
          message = '📵 Busy';
          break;
        case 'no-answer':
          message = '❌ No Answer';
          break;
        case 'failed':
          message = '❌ Failed';
          break;
        case 'canceled':
          message = '🚫 Canceled';
          break;
        default:
          message = `📱 ${status}`;
      }

      await this.sendTelegramMessage(telegram_chat_id, message);
      console.log(`✅ Sent ${status} update for call ${call_sid}`.green);

      // Clean up old status after completion
      if (['completed', 'failed', 'no-answer', 'busy', 'canceled'].includes(status.toLowerCase())) {
        setTimeout(() => {
          // Clean up all statuses for this call after 1 minute
          for (const key of this.activeCallStatus.keys()) {
            if (key.startsWith(call_sid)) {
              this.activeCallStatus.delete(key);
            }
          }
        }, 60000);
      }

      return true;
    } catch (error) {
      console.error('Failed to send call status update:', error);
      return false;
    }
  }

  // Send call transcript in clean format
  async sendCallTranscript(call_sid, telegram_chat_id) {
    try {
      const callDetails = await this.db.getCall(call_sid);
      const transcripts = await this.db.getCallTranscripts(call_sid);
      
      if (!callDetails || !transcripts || transcripts.length === 0) {
        await this.sendTelegramMessage(telegram_chat_id, '❌ No transcript available');
        return;
      }

      // Simple, clean transcript format
      let message = `📋 Call Transcript\n\n`;
      
      // Add essential call info
      message += `📞 ${callDetails.phone_number}\n`;
      if (callDetails.duration) {
        const minutes = Math.floor(callDetails.duration / 60);
        const seconds = callDetails.duration % 60;
        message += `⏱️ ${minutes}:${String(seconds).padStart(2, '0')}\n`;
      }
      message += `💬 ${transcripts.length} messages\n\n`;

      // Add conversation - limit to prevent long messages
      const maxMessages = 8;
      for (let i = 0; i < Math.min(transcripts.length, maxMessages); i++) {
        const t = transcripts[i];
        const speaker = t.speaker === 'user' ? '👤' : '🤖';
        message += `${speaker} ${t.message}\n\n`;
      }

      if (transcripts.length > maxMessages) {
        message += `... and ${transcripts.length - maxMessages} more messages\n\n`;
        message += `Use /transcript ${call_sid} for full details`;
      }

      // Split message if too long
      if (message.length > 4000) {
        const chunks = this.splitMessage(message, 3800);
        for (let i = 0; i < chunks.length; i++) {
          await this.sendTelegramMessage(telegram_chat_id, chunks[i]);
          if (i < chunks.length - 1) {
            await this.delay(1000); // 1 second delay between chunks
          }
        }
      } else {
        await this.sendTelegramMessage(telegram_chat_id, message);
      }

      console.log(`✅ Sent transcript for call ${call_sid}`.green);
      return true;
    } catch (error) {
      console.error('Failed to send call transcript:', error);
      await this.sendTelegramMessage(telegram_chat_id, '❌ Error retrieving transcript');
      return false;
    }
  }

  async sendNotification(notification) {
    const { id, call_sid, notification_type, telegram_chat_id, phone_number } = notification;

    try {
      let success = false;

      switch (notification_type) {
        case 'call_initiated':
          success = await this.sendCallStatusUpdate(call_sid, 'initiated', telegram_chat_id);
          break;
        case 'call_ringing':
          success = await this.sendCallStatusUpdate(call_sid, 'ringing', telegram_chat_id);
          break;
        case 'call_answered':
          success = await this.sendCallStatusUpdate(call_sid, 'answered', telegram_chat_id);
          break;
        case 'call_completed':
          success = await this.sendCallStatusUpdate(call_sid, 'completed', telegram_chat_id);
          break;
        case 'call_transcript':
          success = await this.sendCallTranscript(call_sid, telegram_chat_id);
          break;
        case 'call_failed':
          success = await this.sendCallStatusUpdate(call_sid, 'failed', telegram_chat_id);
          break;
        case 'call_busy':
          success = await this.sendCallStatusUpdate(call_sid, 'busy', telegram_chat_id);
          break;
        case 'call_no_answer':
          success = await this.sendCallStatusUpdate(call_sid, 'no-answer', telegram_chat_id);
          break;
        default:
          throw new Error(`Unknown notification type: ${notification_type}`);
      }

      if (success) {
        await this.db.updateWebhookNotification(id, 'sent', null, new Date().toISOString());
      } else {
        throw new Error('Failed to send notification');
      }

    } catch (error) {
      console.error(`❌ Failed to send notification ${id}:`, error.message);
      await this.db.updateWebhookNotification(id, 'failed', error.message, null);
    }
  }

  async sendTelegramMessage(chatId, message) {
    const url = `https://api.telegram.org/bot${this.telegramBotToken}/sendMessage`;
    
    const payload = {
      chat_id: chatId,
      text: message,
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

  // Utility methods
  splitMessage(message, maxLength) {
    const chunks = [];
    let currentChunk = message;
    
    while (currentChunk.length > maxLength) {
      let splitIndex = currentChunk.lastIndexOf('\n', maxLength);
      if (splitIndex === -1) splitIndex = maxLength;
      
      chunks.push(currentChunk.substring(0, splitIndex));
      currentChunk = currentChunk.substring(splitIndex);
    }
    
    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
    }
    
    return chunks;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Method to send immediate status update (not queued)
  async sendImmediateStatus(call_sid, status, telegram_chat_id) {
    return await this.sendCallStatusUpdate(call_sid, status, telegram_chat_id);
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
          is_running: this.isRunning,
          active_calls: this.activeCallStatus.size
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