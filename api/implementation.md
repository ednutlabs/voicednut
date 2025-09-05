// =============================================================================
// API SERVER SIDE - SMS IMPLEMENTATION
// =============================================================================

// 1. API Routes - SMS Service (api/routes/sms.js)
const EventEmitter = require(‘events’);
const axios = require(‘axios’);

class EnhancedSmsService extends EventEmitter {
constructor() {
super();
this.twilio = require(‘twilio’)(
process.env.TWILIO_ACCOUNT_SID,
process.env.TWILIO_AUTH_TOKEN
);
this.openai = new (require(‘openai’))({
baseURL: “https://openrouter.ai/api/v1”,
apiKey: process.env.OPENROUTER_API_KEY,
defaultHeaders: {
“HTTP-Referer”: process.env.YOUR_SITE_URL || “http://localhost:3000”,
“X-Title”: process.env.YOUR_SITE_NAME || “SMS AI Assistant”,
}
});
this.model = process.env.OPENROUTER_MODEL || “meta-llama/llama-3.1-8b-instruct:free”;

```
// SMS conversation tracking
this.activeConversations = new Map();
this.messageQueue = new Map(); // Queue for outbound messages
```

}

// Send individual SMS
async sendSMS(to, message, from = null) {
try {
const fromNumber = from || process.env.FROM_NUMBER;

```
  if (!fromNumber) {
    throw new Error('No FROM_NUMBER configured for SMS');
  }

  console.log(`📱 Sending SMS to ${to}: ${message.substring(0, 50)}...`);

  const smsMessage = await this.twilio.messages.create({
    body: message,
    from: fromNumber,
    to: to,
    statusCallback: `https://${process.env.SERVER}/webhook/sms-status`
  });

  console.log(`✅ SMS sent successfully: ${smsMessage.sid}`);
  return {
    success: true,
    message_sid: smsMessage.sid,
    to: to,
    from: fromNumber,
    body: message,
    status: smsMessage.status
  };
} catch (error) {
  console.error('❌ SMS sending error:', error);
  throw error;
}
```

}

// Send bulk SMS
async sendBulkSMS(recipients, message, options = {}) {
const results = [];
const { delay = 1000, batchSize = 10 } = options;

```
console.log(`📱 Sending bulk SMS to ${recipients.length} recipients`);

// Process in batches to avoid rate limiting
for (let i = 0; i < recipients.length; i += batchSize) {
  const batch = recipients.slice(i, i + batchSize);
  const batchPromises = batch.map(async (recipient) => {
    try {
      const result = await this.sendSMS(recipient, message);
      return { ...result, recipient, success: true };
    } catch (error) {
      return {
        recipient,
        success: false,
        error: error.message
      };
    }
  });

  const batchResults = await Promise.allSettled(batchPromises);
  results.push(...batchResults.map(r => r.value));

  // Add delay between batches
  if (i + batchSize < recipients.length) {
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}

const successful = results.filter(r => r.success).length;
const failed = results.length - successful;

console.log(`📊 Bulk SMS completed: ${successful} sent, ${failed} failed`);

return {
  total: recipients.length,
  successful,
  failed,
  results
};
```

}

// AI-powered SMS conversation
async handleIncomingSMS(from, body, messageSid) {
try {
console.log(`📨 Incoming SMS from ${from}: ${body}`);

```
  // Get or create conversation context
  let conversation = this.activeConversations.get(from);
  if (!conversation) {
    conversation = {
      phone: from,
      messages: [],
      context: `You are a helpful SMS assistant. Keep responses concise (under 160 chars when possible). Be friendly and professional.`,
      created_at: new Date(),
      last_activity: new Date()
    };
    this.activeConversations.set(from, conversation);
  }

  // Add incoming message to conversation
  conversation.messages.push({
    role: 'user',
    content: body,
    timestamp: new Date(),
    message_sid: messageSid
  });
  conversation.last_activity = new Date();

  // Generate AI response
  const aiResponse = await this.generateAIResponse(conversation);

  // Send response SMS
  const smsResult = await this.sendSMS(from, aiResponse);

  // Add AI response to conversation
  conversation.messages.push({
    role: 'assistant',
    content: aiResponse,
    timestamp: new Date(),
    message_sid: smsResult.message_sid
  });

  // Emit events for tracking
  this.emit('conversation_updated', {
    phone: from,
    conversation: conversation,
    ai_response: aiResponse
  });

  return {
    success: true,
    ai_response: aiResponse,
    message_sid: smsResult.message_sid
  };

} catch (error) {
  console.error('❌ Error handling incoming SMS:', error);
  
  // Send fallback message
  try {
    await this.sendSMS(from, "Sorry, I'm experiencing technical difficulties. Please try again later.");
  } catch (fallbackError) {
    console.error('❌ Failed to send fallback message:', fallbackError);
  }

  throw error;
}
```

}

// Generate AI response for SMS
async generateAIResponse(conversation) {
try {
const messages = [
{ role: ‘system’, content: conversation.context },
…conversation.messages.slice(-10) // Keep last 10 messages for context
];

```
  const completion = await this.openai.chat.completions.create({
    model: this.model,
    messages: messages,
    max_tokens: 150,
    temperature: 0.7
  });

  let response = completion.choices[0].message.content.trim();

  // Ensure response is SMS-friendly (under 1600 chars, ideally under 160)
  if (response.length > 1500) {
    response = response.substring(0, 1500) + "...";
  }

  return response;

} catch (error) {
  console.error('❌ AI response generation error:', error);
  return "I apologize, but I'm having trouble processing your request right now. Please try again later.";
}
```

}

// Get conversation history
getConversation(phone) {
return this.activeConversations.get(phone) || null;
}

// Get active conversations summary
getActiveConversations() {
const conversations = [];
for (const [phone, conversation] of this.activeConversations.entries()) {
conversations.push({
phone,
message_count: conversation.messages.length,
created_at: conversation.created_at,
last_activity: conversation.last_activity
});
}
return conversations;
}

// Clean up old conversations
cleanupOldConversations(maxAgeHours = 24) {
const cutoff = new Date(Date.now() - (maxAgeHours * 60 * 60 * 1000));
let cleanedCount = 0;

```
for (const [phone, conversation] of this.activeConversations.entries()) {
  if (conversation.last_activity < cutoff) {
    this.activeConversations.delete(phone);
    cleanedCount++;
  }
}

if (cleanedCount > 0) {
  console.log(`🧹 Cleaned up ${cleanedCount} old SMS conversations`);
}

return cleanedCount;
```

}

// Schedule SMS for later sending
async scheduleSMS(to, message, scheduledTime, options = {}) {
const scheduleData = {
to,
message,
scheduledTime: new Date(scheduledTime),
created_at: new Date(),
options,
status: ‘scheduled’
};

```
// In a real implementation, this would be stored in database
// For now, we'll use a simple Map
const scheduleId = `sched_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
this.messageQueue.set(scheduleId, scheduleData);

console.log(`📅 SMS scheduled for ${scheduledTime}: ${scheduleId}`);

return {
  schedule_id: scheduleId,
  scheduled_time: scheduledTime,
  status: 'scheduled'
};
```

}

// Process scheduled messages
async processScheduledMessages() {
const now = new Date();
const toSend = [];

```
for (const [scheduleId, scheduleData] of this.messageQueue.entries()) {
  if (scheduleData.status === 'scheduled' && scheduleData.scheduledTime <= now) {
    toSend.push({ scheduleId, scheduleData });
  }
}

for (const { scheduleId, scheduleData } of toSend) {
  try {
    const result = await this.sendSMS(scheduleData.to, scheduleData.message);
    scheduleData.status = 'sent';
    scheduleData.sent_at = new Date();
    scheduleData.message_sid = result.message_sid;

    console.log(`📱 Scheduled SMS sent: ${scheduleId}`);
  } catch (error) {
    console.error(`❌ Failed to send scheduled SMS ${scheduleId}:`, error);
    scheduleData.status = 'failed';
    scheduleData.error = error.message;
  }
}

return toSend.length;
```

}

// SMS templates system
getTemplate(templateName, variables = {}) {
const templates = {
welcome: “Welcome to our service! We’re excited to have you aboard. Reply HELP for assistance or STOP to unsubscribe.”,

```
  appointment_reminder: "Reminder: You have an appointment on {date} at {time}. Reply CONFIRM to confirm or RESCHEDULE to change.",
  
  verification: "Your verification code is: {code}. This code will expire in 10 minutes. Do not share this code with anyone.",
  
  order_update: "Order #{order_id} update: {status}. Track your order at {tracking_url}",
  
  payment_reminder: "Payment reminder: Your payment of {amount} is due on {due_date}. Pay now: {payment_url}",
  
  promotional: "🎉 Special offer just for you! {offer_text} Use code {promo_code}. Valid until {expiry_date}. Reply STOP to opt out.",
  
  customer_service: "Thanks for contacting us! We've received your message and will respond within 24 hours. For urgent matters, call {phone}.",
  
  survey: "How was your experience with us? Rate us 1-5 stars by replying with a number. Your feedback helps us improve!"
};

let template = templates[templateName];
if (!template) {
  throw new Error(`Template '${templateName}' not found`);
}

// Replace variables
for (const [key, value] of Object.entries(variables)) {
  template = template.replace(new RegExp(`{${key}}`, 'g'), value);
}

return template;
```

}

// Get service statistics
getStatistics() {
const activeConversations = this.activeConversations.size;
const scheduledMessages = Array.from(this.messageQueue.values())
.filter(msg => msg.status === ‘scheduled’).length;

```
return {
  active_conversations: activeConversations,
  scheduled_messages: scheduledMessages,
  total_conversations_today: activeConversations, // Would be from DB in real implementation
  message_queue_size: this.messageQueue.size
};
```

}
}

// =============================================================================
// 2. API ENDPOINTS INTEGRATION (add to api/app.js)
// =============================================================================

// Initialize SMS service
const smsService = new EnhancedSmsService();

// SMS webhook endpoints
app.post(’/webhook/sms’, async (req, res) => {
try {
const { From, Body, MessageSid, SmsStatus } = req.body;

```
console.log(`📨 SMS webhook: ${From} -> ${Body}`);

// Handle incoming SMS with AI
const result = await smsService.handleIncomingSMS(From, Body, MessageSid);

// Save to database if needed
if (db) {
  await db.saveSMSMessage({
    message_sid: MessageSid,
    from_number: From,
    body: Body,
    status: SmsStatus,
    direction: 'inbound',
    ai_response: result.ai_response,
    response_message_sid: result.message_sid
  });
}

res.status(200).send('OK');
```

} catch (error) {
console.error(‘❌ SMS webhook error:’, error);
res.status(500).send(‘Error’);
}
});

app.post(’/webhook/sms-status’, async (req, res) => {
try {
const { MessageSid, MessageStatus, ErrorCode, ErrorMessage } = req.body;

```
console.log(`📱 SMS status update: ${MessageSid} -> ${MessageStatus}`);

if (db) {
  await db.updateSMSStatus(MessageSid, {
    status: MessageStatus,
    error_code: ErrorCode,
    error_message: ErrorMessage,
    updated_at: new Date()
  });
}

res.status(200).send('OK');
```

} catch (error) {
console.error(‘❌ SMS status webhook error:’, error);
res.status(500).send(‘OK’); // Return OK to prevent retries
}
});

// Send single SMS endpoint
app.post(’/api/sms/send’, async (req, res) => {
try {
const { to, message, from, user_chat_id } = req.body;

```
if (!to || !message) {
  return res.status(400).json({
    success: false,
    error: 'Phone number and message are required'
  });
}

// Validate phone number format
if (!to.match(/^\+[1-9]\d{1,14}$/)) {
  return res.status(400).json({
    success: false,
    error: 'Invalid phone number format. Use E.164 format (e.g., +1234567890)'
  });
}

const result = await smsService.sendSMS(to, message, from);

// Save to database
if (db) {
  await db.saveSMSMessage({
    message_sid: result.message_sid,
    to_number: to,
    from_number: result.from,
    body: message,
    status: result.status,
    direction: 'outbound',
    user_chat_id: user_chat_id
  });
  
  // Create webhook notification
  if (user_chat_id) {
    await db.createEnhancedWebhookNotification(
      result.message_sid, 
      'sms_sent', 
      user_chat_id
    );
  }
}

res.json({
  success: true,
  ...result
});
```

} catch (error) {
console.error(‘❌ SMS send error:’, error);
res.status(500).json({
success: false,
error: ‘Failed to send SMS’,
details: error.message
});
}
});

// Send bulk SMS endpoint
app.post(’/api/sms/bulk’, async (req, res) => {
try {
const { recipients, message, options = {}, user_chat_id } = req.body;

```
if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
  return res.status(400).json({
    success: false,
    error: 'Recipients array is required and must not be empty'
  });
}

if (!message) {
  return res.status(400).json({
    success: false,
    error: 'Message is required'
  });
}

if (recipients.length > 100) {
  return res.status(400).json({
    success: false,
    error: 'Maximum 100 recipients per bulk send'
  });
}

const result = await smsService.sendBulkSMS(recipients, message, options);

// Log bulk operation
if (db) {
  await db.logBulkSMSOperation({
    total_recipients: result.total,
    successful: result.successful,
    failed: result.failed,
    message: message,
    user_chat_id: user_chat_id,
    timestamp: new Date()
  });
}

res.json({
  success: true,
  ...result
});
```

} catch (error) {
console.error(‘❌ Bulk SMS error:’, error);
res.status(500).json({
success: false,
error: ‘Failed to send bulk SMS’,
details: error.message
});
}
});

// Schedule SMS endpoint
app.post(’/api/sms/schedule’, async (req, res) => {
try {
const { to, message, scheduled_time, options = {} } = req.body;

```
if (!to || !message || !scheduled_time) {
  return res.status(400).json({
    success: false,
    error: 'Phone number, message, and scheduled_time are required'
  });
}

const scheduledDate = new Date(scheduled_time);
if (scheduledDate <= new Date()) {
  return res.status(400).json({
    success: false,
    error: 'Scheduled time must be in the future'
  });
}

const result = await smsService.scheduleSMS(to, message, scheduled_time, options);

res.json({
  success: true,
  ...result
});
```

} catch (error) {
console.error(‘❌ SMS schedule error:’, error);
res.status(500).json({
success: false,
error: ‘Failed to schedule SMS’,
details: error.message
});
}
});

// Get SMS conversation
app.get(’/api/sms/conversation/:phone’, async (req, res) => {
try {
const { phone } = req.params;
const conversation = smsService.getConversation(phone);

```
if (!conversation) {
  return res.status(404).json({
    success: false,
    error: 'Conversation not found'
  });
}

res.json({
  success: true,
  conversation: {
    ...conversation,
    messages: conversation.messages.slice(-50) // Last 50 messages
  }
});
```

} catch (error) {
console.error(‘❌ Get conversation error:’, error);
res.status(500).json({
success: false,
error: ‘Failed to get conversation’
});
}
});

// Get SMS statistics
app.get(’/api/sms/stats’, async (req, res) => {
try {
const stats = smsService.getStatistics();
const activeConversations = smsService.getActiveConversations();

```
res.json({
  success: true,
  statistics: stats,
  active_conversations: activeConversations.slice(0, 20), // Last 20 conversations
  sms_service_enabled: true
});
```

} catch (error) {
console.error(‘❌ SMS stats error:’, error);
res.status(500).json({
success: false,
error: ‘Failed to get SMS statistics’
});
}
});

// SMS templates endpoint
app.get(’/api/sms/templates’, async (req, res) => {
try {
const { template_name, variables } = req.query;

```
if (template_name) {
  try {
    const parsedVariables = variables ? JSON.parse(variables) : {};
    const template = smsService.getTemplate(template_name, parsedVariables);
    
    res.json({
      success: true,
      template_name,
      template,
      variables: parsedVariables
    });
  } catch (templateError) {
    res.status(400).json({
      success: false,
      error: templateError.message
    });
  }
} else {
  // Return available templates
  res.json({
    success: true,
    available_templates: [
      'welcome', 'appointment_reminder', 'verification', 'order_update',
      'payment_reminder', 'promotional', 'customer_service', 'survey'
    ]
  });
}
```

} catch (error) {
console.error(‘❌ SMS templates error:’, error);
res.status(500).json({
success: false,
error: ‘Failed to get templates’
});
}
});

// Start scheduled message processor
setInterval(() => {
smsService.processScheduledMessages().catch(error => {
console.error(‘❌ Scheduled SMS processing error:’, error);
});
}, 60000); // Check every minute

// Cleanup old conversations every hour
setInterval(() => {
smsService.cleanupOldConversations(24); // Keep conversations for 24 hours
}, 60 * 60 * 1000);

// =============================================================================
// 3. DATABASE SCHEMA ADDITIONS (api/db/db.js)
// =============================================================================

// Add these methods to your Database class:

// Create SMS messages table
async initializeSMSTables() {
return new Promise((resolve, reject) => {
const createSMSTable = `CREATE TABLE IF NOT EXISTS sms_messages ( id INTEGER PRIMARY KEY AUTOINCREMENT, message_sid TEXT UNIQUE NOT NULL, to_number TEXT, from_number TEXT, body TEXT NOT NULL, status TEXT DEFAULT 'queued', direction TEXT NOT NULL, -- 'inbound' or 'outbound' error_code TEXT, error_message TEXT, ai_response TEXT, response_message_sid TEXT, user_chat_id TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP );`;

```
const createBulkSMSTable = `
  CREATE TABLE IF NOT EXISTS bulk_sms_operations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    total_recipients INTEGER NOT NULL,
    successful INTEGER DEFAULT 0,
    failed INTEGER DEFAULT 0,
    message TEXT NOT NULL,
    user_chat_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`;

this.db.serialize(() => {
  this.db.run(createSMSTable);
  this.db.run(createBulkSMSTable, (err) => {
    if (err) reject(err);
    else resolve();
  });
});
```

});
}

// Save SMS message
async saveSMSMessage(messageData) {
return new Promise((resolve, reject) => {
const sql = `INSERT INTO sms_messages ( message_sid, to_number, from_number, body, status,  direction, ai_response, response_message_sid, user_chat_id ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

```
this.db.run(sql, [
  messageData.message_sid,
  messageData.to_number || null,
  messageData.from_number || null,
  messageData.body,
  messageData.status || 'queued',
  messageData.direction,
  messageData.ai_response || null,
  messageData.response_message_sid || null,
  messageData.user_chat_id || null
], function(err) {
  if (err) reject(err);
  else resolve(this.lastID);
});
```

});
}

// Update SMS status
async updateSMSStatus(messageSid, statusData) {
return new Promise((resolve, reject) => {
const sql = `UPDATE sms_messages  SET status = ?, error_code = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE message_sid = ?`;

```
this.db.run(sql, [
  statusData.status,
  statusData.error_code || null,
  statusData.error_message || null,
  messageSid
], function(err) {
  if (err) reject(err);
  else resolve(this.changes);
});
```

});
}

// Log bulk SMS operation
async logBulkSMSOperation(operationData) {
return new Promise((resolve, reject) => {
const sql = `INSERT INTO bulk_sms_operations ( total_recipients, successful, failed, message, user_chat_id ) VALUES (?, ?, ?, ?, ?)`;

```
this.db.run(sql, [
  operationData.total_recipients,
  operationData.successful,
  operationData.failed,
  operationData.message,
  operationData.user_chat_id || null
], function(err) {
  if (err) reject(err);
  else resolve(this.lastID);
});
```

});
}

// Get SMS messages
async getSMSMessages(limit = 50, offset = 0) {
return new Promise((resolve, reject) => {
const sql = `SELECT * FROM sms_messages  ORDER BY created_at DESC  LIMIT ? OFFSET ?`;

```
this.db.all(sql, [limit, offset], (err, rows) => {
  if (err) reject(err);
  else resolve(rows || []);
});
```

});
}

// Get SMS conversation
async getSMSConversation(phoneNumber, limit = 50) {
return new Promise((resolve, reject) => {
const sql = `SELECT * FROM sms_messages  WHERE to_number = ? OR from_number = ? ORDER BY created_at ASC  LIMIT ?`;

```
this.db.all(sql, [phoneNumber, phoneNumber, limit], (err, rows) => {
  if (err) reject(err);
  else resolve(rows || []);
});
```

});
}
