const axios = require('axios');

class EnhancedWebhookService {
    constructor() {
        this.isRunning = false;
        this.db = null;
        this.processingInterval = null;
        this.retryInterval = null;
        this.telegramBotToken = process.env.BOT_TOKEN;
        this.apiUrl = process.env.API_URL || 'https://api.telegram.org';
        
        // Statistics tracking
        this.stats = {
            processed: 0,
            successful: 0,
            failed: 0,
            retried: 0
        };
    }

    start(database) {
        if (this.isRunning) {
            console.log('⚠️ Enhanced webhook service already running');
            return;
        }

        this.db = database;
        this.isRunning = true;

        console.log('🚀 Starting enhanced webhook notification service...'.blue);

        // Process pending notifications every 10 seconds
        this.processingInterval = setInterval(() => {
            this.processPendingNotifications();
        }, 10000);

        // Retry failed notifications every 5 minutes
        this.retryInterval = setInterval(() => {
            this.retryFailedNotifications();
        }, 5 * 60 * 1000);

        console.log('✅ Enhanced webhook service started'.green);
    }

    stop() {
        if (!this.isRunning) return;

        console.log('🛑 Stopping enhanced webhook service...'.yellow);
        
        this.isRunning = false;
        
        if (this.processingInterval) {
            clearInterval(this.processingInterval);
            this.processingInterval = null;
        }
        
        if (this.retryInterval) {
            clearInterval(this.retryInterval);
            this.retryInterval = null;
        }

        console.log('✅ Enhanced webhook service stopped'.green);
    }

    async processPendingNotifications() {
        if (!this.db || !this.isRunning) return;

        try {
            const pendingNotifications = await this.db.getEnhancedPendingWebhookNotifications(20);
            
            if (pendingNotifications.length === 0) return;

            console.log(`📨 Processing ${pendingNotifications.length} pending notifications...`.cyan);

            for (const notification of pendingNotifications) {
                await this.processNotification(notification);
                
                // Small delay to prevent rate limiting
                await this.delay(200);
            }

        } catch (error) {
            console.error('❌ Error processing pending notifications:', error);
            
            // Log error to service health
            if (this.db) {
                await this.db.logServiceHealth('webhook_service', 'processing_error', {
                    error: error.message,
                    operation: 'process_pending'
                });
            }
        }
    }

    async processNotification(notification) {
        try {
            const message = this.generateNotificationMessage(notification);
            
            if (!message) {
                console.warn(`⚠️ Could not generate message for notification ${notification.id}`);
                await this.db.updateEnhancedWebhookNotification(notification.id, 'failed', 'Could not generate message');
                return;
            }

            const success = await this.sendTelegramMessage(notification.telegram_chat_id, message);
            
            if (success) {
                await this.db.updateEnhancedWebhookNotification(notification.id, 'sent', null, success.message_id);
                await this.db.logNotificationMetric(notification.notification_type, true, success.delivery_time);
                
                this.stats.successful++;
                console.log(`✅ Sent ${notification.notification_type} notification to ${notification.telegram_chat_id}`.green);
            } else {
                await this.db.updateEnhancedWebhookNotification(notification.id, 'failed', 'Failed to send to Telegram');
                await this.db.logNotificationMetric(notification.notification_type, false);
                
                this.stats.failed++;
                console.log(`❌ Failed to send ${notification.notification_type} notification`.red);
            }

            this.stats.processed++;

        } catch (error) {
            console.error(`❌ Error processing notification ${notification.id}:`, error);
            
            await this.db.updateEnhancedWebhookNotification(
                notification.id, 
                'failed', 
                `Processing error: ${error.message}`
            );
            
            this.stats.failed++;
        }
    }

    generateNotificationMessage(notification) {
        const { notification_type, call_sid } = notification;
        
        // Get additional data from notification
        const callData = {
            phone_number: notification.phone_number || 'Unknown',
            call_summary: notification.call_summary || '',
            ai_analysis: notification.ai_analysis || '',
            call_status: notification.call_status || 'unknown',
            duration: notification.call_duration || 0,
            twilio_status: notification.twilio_status || ''
        };

        // Enhanced message templates with emojis and formatting
        const templates = {
            // Call notifications
            call_initiated: () => 
                `📞 *Call Initiated*\n\n` +
                `🎯 Call ID: \`${call_sid.substring(0, 8)}...\`\n` +
                `📱 Number: ${callData.phone_number}\n` +
                `📊 Status: Initiated\n` +
                `⏰ Time: ${new Date().toLocaleString()}\n\n` +
                `🔄 Attempting to connect...`,

            call_ringing: () =>
                `📲 *Call Ringing*\n\n` +
                `🎯 Call ID: \`${call_sid.substring(0, 8)}...\`\n` +
                `📱 Number: ${callData.phone_number}\n` +
                `📞 Status: Ringing\n` +
                `⏰ Time: ${new Date().toLocaleString()}\n\n` +
                `⏳ Waiting for answer...`,

            call_answered: () =>
                `✅ *Call Answered*\n\n` +
                `🎯 Call ID: \`${call_sid.substring(0, 8)}...\`\n` +
                `📱 Number: ${callData.phone_number}\n` +
                `🟢 Status: In Progress\n` +
                `⏰ Answered: ${new Date().toLocaleString()}\n\n` +
                `🗣️ Conversation started!`,

            call_completed: () => {
                const duration = callData.duration;
                const minutes = Math.floor(duration / 60);
                const seconds = duration % 60;
                const durationStr = duration > 0 ? `${minutes}:${String(seconds).padStart(2, '0')}` : 'N/A';
                
                return `🎉 *Call Completed Successfully*\n\n` +
                    `🎯 Call ID: \`${call_sid.substring(0, 8)}...\`\n` +
                    `📱 Number: ${callData.phone_number}\n` +
                    `✅ Status: Completed\n` +
                    `⏱️ Duration: ${durationStr}\n` +
                    `⏰ Ended: ${new Date().toLocaleString()}\n\n` +
                    (callData.call_summary ? 
                        `📝 Summary: ${callData.call_summary.substring(0, 200)}${callData.call_summary.length > 200 ? '...' : ''}` : 
                        '📋 Call completed successfully');
            },

            call_no_answer: () =>
                `📵 *Call No Answer*\n\n` +
                `🎯 Call ID: \`${call_sid.substring(0, 8)}...\`\n` +
                `📱 Number: ${callData.phone_number}\n` +
                `📞 Status: No Answer\n` +
                `⏰ Time: ${new Date().toLocaleString()}\n\n` +
                `🔄 Consider trying again later`,

            call_busy: () =>
                `📞 *Call Busy*\n\n` +
                `🎯 Call ID: \`${call_sid.substring(0, 8)}...\`\n` +
                `📱 Number: ${callData.phone_number}\n` +
                `🔴 Status: Busy\n` +
                `⏰ Time: ${new Date().toLocaleString()}\n\n` +
                `📋 Line was busy, try again later`,

            call_failed: () =>
                `❌ *Call Failed*\n\n` +
                `🎯 Call ID: \`${call_sid.substring(0, 8)}...\`\n` +
                `📱 Number: ${callData.phone_number}\n` +
                `⚠️ Status: Failed\n` +
                `⏰ Time: ${new Date().toLocaleString()}\n\n` +
                `🔧 Check number format and try again`,

            call_canceled: () =>
                `🚫 *Call Canceled*\n\n` +
                `🎯 Call ID: \`${call_sid.substring(0, 8)}...\`\n` +
                `📱 Number: ${callData.phone_number}\n` +
                `🛑 Status: Canceled\n` +
                `⏰ Time: ${new Date().toLocaleString()}`,

            call_transcript: () =>
                `📋 *Call Transcript Ready*\n\n` +
                `🎯 Call ID: \`${call_sid.substring(0, 8)}...\`\n` +
                `📱 Number: ${callData.phone_number}\n` +
                `📝 Transcript available\n` +
                `⏰ Time: ${new Date().toLocaleString()}\n\n` +
                `Use /transcript ${call_sid} to view`,

            // SMS notifications
            sms_sent: () =>
                `📤 *SMS Sent*\n\n` +
                `📱 To: ${callData.phone_number}\n` +
                `🆔 Message ID: \`${call_sid.substring(0, 12)}...\`\n` +
                `📊 Status: Queued for delivery\n` +
                `⏰ Time: ${new Date().toLocaleString()}\n\n` +
                `🔔 You'll receive delivery confirmation`,

            sms_delivered: () =>
                `✅ *SMS Delivered*\n\n` +
                `📱 To: ${callData.phone_number}\n` +
                `🆔 Message ID: \`${call_sid.substring(0, 12)}...\`\n` +
                `📨 Status: Successfully delivered\n` +
                `⏰ Delivered: ${new Date().toLocaleString()}`,

            sms_failed: () =>
                `❌ *SMS Delivery Failed*\n\n` +
                `📱 To: ${callData.phone_number}\n` +
                `🆔 Message ID: \`${call_sid.substring(0, 12)}...\`\n` +
                `⚠️ Status: Delivery failed\n` +
                `⏰ Time: ${new Date().toLocaleString()}\n\n` +
                `🔧 Check number and try again`,

            sms_undelivered: () =>
                `⏳ *SMS Undelivered*\n\n` +
                `📱 To: ${callData.phone_number}\n` +
                `🆔 Message ID: \`${call_sid.substring(0, 12)}...\`\n` +
                `📞 Status: Could not deliver\n` +
                `⏰ Time: ${new Date().toLocaleString()}\n\n` +
                `📋 Recipient may be unavailable`
        };

        const template = templates[notification_type];
        
        if (!template) {
            console.warn(`⚠️ No template found for notification type: ${notification_type}`);
            return `🔔 *Notification*\n\nType: ${notification_type}\nCall/Message ID: \`${call_sid}\`\nTime: ${new Date().toLocaleString()}`;
        }

        try {
            return template();
        } catch (error) {
            console.error(`❌ Error generating message for ${notification_type}:`, error);
            return `🔔 *System Notification*\n\nType: ${notification_type}\nID: \`${call_sid}\`\nTime: ${new Date().toLocaleString()}\n\nDetails in system logs.`;
        }
    }

    async sendTelegramMessage(chatId, message) {
        if (!this.telegramBotToken) {
            console.error('❌ Telegram bot token not configured');
            return false;
        }

        const startTime = Date.now();
        
        try {
            const response = await axios.post(
                `${this.apiUrl}/bot${this.telegramBotToken}/sendMessage`,
                {
                    chat_id: chatId,
                    text: message,
                    parse_mode: 'Markdown',
                    disable_web_page_preview: true
                },
                {
                    timeout: 10000,
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            );

            const deliveryTime = Date.now() - startTime;

            if (response.data.ok) {
                return {
                    success: true,
                    message_id: response.data.result.message_id,
                    delivery_time: deliveryTime
                };
            } else {
                console.error('❌ Telegram API error:', response.data);
                return false;
            }

        } catch (error) {
            console.error('❌ Error sending Telegram message:', error.message);
            
            // Handle specific Telegram errors
            if (error.response) {
                const { status, data } = error.response;
                console.error(`❌ Telegram HTTP ${status}:`, data);
                
                // Don't retry for certain errors
                if (status === 400 || status === 403) {
                    return false; // Bad request or forbidden - don't retry
                }
            }
            
            return false;
        }
    }

    async retryFailedNotifications() {
        if (!this.db || !this.isRunning) return;

        try {
            const failedNotifications = await new Promise((resolve, reject) => {
                this.db.db.all(`
                    SELECT wn.*, c.phone_number, c.call_summary, c.ai_analysis, c.status as call_status, c.duration as call_duration, c.twilio_status
                    FROM webhook_notifications wn
                    LEFT JOIN calls c ON wn.call_sid = c.call_sid
                    WHERE wn.status = 'failed' 
                    AND wn.retry_count < 3
                    AND datetime(wn.created_at, '+' || (wn.retry_count * 10) || ' minutes') <= datetime('now')
                    ORDER BY wn.priority DESC, wn.created_at ASC
                    LIMIT 10
                `, (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                });
            });

            if (failedNotifications.length === 0) return;

            console.log(`🔄 Retrying ${failedNotifications.length} failed notifications...`.yellow);

            for (const notification of failedNotifications) {
                // Update status to retrying
                await this.db.updateEnhancedWebhookNotification(notification.id, 'retrying', 'Retry attempt');
                
                // Process the notification
                await this.processNotification(notification);
                
                this.stats.retried++;
                
                // Delay between retries
                await this.delay(1000);
            }

        } catch (error) {
            console.error('❌ Error retrying failed notifications:', error);
            
            if (this.db) {
                await this.db.logServiceHealth('webhook_service', 'retry_error', {
                    error: error.message,
                    operation: 'retry_failed'
                });
            }
        }
    }

    async sendImmediateStatus(callSid, status, userChatId) {
        try {
            // Create immediate notification
            const notificationId = await this.db.createEnhancedWebhookNotification(callSid, status, userChatId, 'urgent');
            
            // Get the notification with call data
            const notification = await new Promise((resolve, reject) => {
                this.db.db.get(`
                    SELECT wn.*, c.phone_number, c.call_summary, c.ai_analysis, c.status as call_status, c.duration as call_duration, c.twilio_status
                    FROM webhook_notifications wn
                    LEFT JOIN calls c ON wn.call_sid = c.call_sid
                    WHERE wn.id = ?
                `, [notificationId], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });

            if (notification) {
                await this.processNotification(notification);
                return true;
            }

            return false;

        } catch (error) {
            console.error('❌ Error sending immediate status:', error);
            return false;
        }
    }

    async healthCheck() {
        const health = {
            status: this.isRunning ? 'running' : 'stopped',
            telegram_configured: !!this.telegramBotToken,
            statistics: { ...this.stats },
            last_check: new Date().toISOString()
        };

        if (this.db) {
            try {
                // Get pending notifications count
                const pendingCount = await new Promise((resolve, reject) => {
                    this.db.db.get(
                        `SELECT COUNT(*) as count FROM webhook_notifications WHERE status IN ('pending', 'retrying')`,
                        [],
                        (err, row) => {
                            if (err) reject(err);
                            else resolve(row?.count || 0);
                        }
                    );
                });

                health.pending_notifications = pendingCount;
                health.database_connected = true;

            } catch (dbError) {
                health.database_connected = false;
                health.database_error = dbError.message;
            }
        } else {
            health.database_connected = false;
        }

        return health;
    }

    getCallStatusStats() {
        return {
            ...this.stats,
            is_running: this.isRunning,
            uptime: this.isRunning ? 'Active' : 'Stopped'
        };
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Export singleton instance
const webhookService = new EnhancedWebhookService();
module.exports = { webhookService };