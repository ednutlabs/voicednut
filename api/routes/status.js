/**
 * Import required dependencies
 */
const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const config = require('../config');
const { getCall } = require('../db/db');

function statusHandler(request, response) {
    const db = new sqlite3.Database('../db/calls.db');
    
    const call_uuid = request.params.call_uuid;
    const status = request.body.status;
    const call_sid = request.body.CallSid;

    if (!call_uuid || !status) {
        return response.status(400).json({ error: 'Missing required parameters' });
    }

    db.get('SELECT * FROM calls WHERE call_uuid = ?', [call_uuid], (err, row) => {
        if (err) {
            console.error('Database error:', err);
            return response.status(500).json({ error: 'Database error' });
        }

        if (!row) {
            return response.status(404).json({ error: 'Call not found' });
        }

        db.run(
            'UPDATE calls SET status = ? WHERE call_uuid = ?',
            [status, call_uuid],
            async function(err) {
                if (err) {
                    console.error('Update error:', err);
                    return response.status(500).json({ error: 'Update failed' });
                }

                if (status === 'completed') {
                    try {
                        await sendWebhookNotification(row);
                        console.log('Webhook notification sent for call:', call_uuid);
                    } catch (error) {
                        console.error('Webhook error:', error);
                    }
                }

                return response.status(200).json({ 
                    success: true,
                    message: 'Status updated successfully'
                });
            }
        );
    });

    async function sendWebhookNotification(callData) {
        const telegramUrl = `https://api.telegram.org/bot${config.bot.token}/sendMessage`;
        if (!config.bot.token) {
            throw new Error('Bot webhook URL not configured');
        }

        const message = {
            call_uuid: callData.call_uuid,
            phone_number: callData.phone_number,
            status: callData.status,
            call_sid: callData.call_sid,
            timestamp: callData.timestamp,
            user_chat_id: callData.user_chat_id,
            prompt: callData.prompt,
            first_message: callData.first_message,
            parse_mode: 'Markdown'
        };

        try {
            await axios.post(telegramUrl, message, {
                headers: { 'Content-Type': 'application/json' }
            });
        } catch (error) {
            console.error('Failed to send webhook:', error.response?.data || error.message);
            throw error;
        }
    }
}

module.exports = statusHandler;