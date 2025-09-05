require('dotenv').config();
require('colors');

const express = require('express');
const ExpressWs = require('express-ws');
const path = require('path');

const { EnhancedGptService } = require('./routes/gpt');
const { StreamService } = require('./routes/stream');
const { TranscriptionService } = require('./routes/transcription');
const { TextToSpeechService } = require('./routes/tts');
const { recordingService } = require('./routes/recording');
const { EnhancedSmsService } = require('./routes/sms.js');
const Database = require('./db/db');
const { webhookService } = require('./routes/status');
const DynamicFunctionEngine = require('./functions/DynamicFunctionEngine');

const VoiceResponse = require('twilio').twiml.VoiceResponse;

const app = express();
ExpressWs(app);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;

// Enhanced call configurations with function context
const callConfigurations = new Map();
const activeCalls = new Map();
const callFunctionSystems = new Map(); // Store generated functions per call

let db;
const functionEngine = new DynamicFunctionEngine();
const smsService = new EnhancedSmsService();

async function startServer() {
  try {
    console.log('🚀 Initializing Adaptive AI Call System...'.blue);

    // Initialize database first
    console.log('Initializing enhanced database...'.yellow);
    db = new Database();
    await db.initialize();
    console.log('✅ Enhanced database initialized successfully'.green);

    // Start webhook service after database is ready
    console.log('Starting enhanced webhook service...'.yellow);
    webhookService.start(db);
    console.log('✅ Enhanced webhook service started'.green);

    // Initialize function engine
    console.log('✅ Dynamic Function Engine ready'.green);

    // Start HTTP server
    app.listen(PORT, () => {
      console.log(`✅ Enhanced Adaptive API server running on port ${PORT}`.green);
      console.log(`🎭 System ready - Personality Engine & Dynamic Functions active`.green);
      console.log(`📱 Enhanced webhook notifications enabled`.green);
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Enhanced WebSocket connection handler with dynamic functions
app.ws('/connection', (ws) => {
  console.log('🔌 New WebSocket connection established'.cyan);
  
  try {
    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });

    let streamSid;
    let callSid;
    let callConfig = null;
    let callStartTime = null;
    let functionSystem = null;

    let gptService;
    const streamService = new StreamService(ws);
    const transcriptionService = new TranscriptionService();
    const ttsService = new TextToSpeechService({});
  
    let marks = [];
    let interactionCount = 0;
    let isInitialized = false;
  
    ws.on('message', async function message(data) {
      try {
        const msg = JSON.parse(data);
        
        if (msg.event === 'start') {
          streamSid = msg.start.streamSid;
          callSid = msg.start.callSid;
          callStartTime = new Date();
          
          console.log(`🎯 Adaptive call started - SID: ${callSid}`.green);
          
          streamService.setStreamSid(streamSid);

          // Update database with enhanced tracking
          try {
            await db.updateCallStatus(callSid, 'started', {
              started_at: callStartTime.toISOString()
            });
            await db.updateCallState(callSid, 'stream_started', {
              stream_sid: streamSid,
              start_time: callStartTime.toISOString()
            });
            
            // Create webhook notification for stream start (internal tracking)
            const call = await db.getCall(callSid);
            if (call && call.user_chat_id) {
              await db.createEnhancedWebhookNotification(callSid, 'call_stream_started', call.user_chat_id);
            }
          } catch (dbError) {
            console.error('Database error on call start:', dbError);
          }

          // Get call configuration and function system
          callConfig = callConfigurations.get(callSid);
          functionSystem = callFunctionSystems.get(callSid);
          
          if (callConfig && functionSystem) {
            console.log(`🎭 Using adaptive configuration for ${functionSystem.context.industry} industry`.green);
            console.log(`🔧 Available functions: ${Object.keys(functionSystem.implementations).join(', ')}`.cyan);
            
            // Initialize Enhanced GPT service with dynamic functions
            gptService = new EnhancedGptService(callConfig.prompt, callConfig.first_message);
            
            // Inject the dynamic function system
            gptService.setDynamicFunctions(functionSystem.functions, functionSystem.implementations);
            
          } else {
            console.log(`🎯 Standard call detected: ${callSid}`.yellow);
            // Use default configuration for regular calls
            gptService = new EnhancedGptService();
          }
          
          gptService.setCallSid(callSid);

          // Set up GPT reply handler with personality tracking
          gptService.on('gptreply', async (gptReply, icount) => {
            const personalityInfo = gptReply.personalityInfo || {};
            console.log(`🎭 ${personalityInfo.name || 'Default'} Personality: ${gptReply.partialResponse.substring(0, 50)}...`.green);
            
            // Save AI response to database with personality context
            try {
              await db.addTranscript({
                call_sid: callSid,
                speaker: 'ai',
                message: gptReply.partialResponse,
                interaction_count: icount,
                personality_used: personalityInfo.name || 'default',
                adaptation_data: JSON.stringify(gptReply.adaptationHistory || [])
              });
              
              await db.updateCallState(callSid, 'ai_responded', {
                message: gptReply.partialResponse,
                interaction_count: icount,
                personality: personalityInfo.name
              });
            } catch (dbError) {
              console.error('Database error adding AI transcript:', dbError);
            }
            
            ttsService.generate(gptReply, icount);
          });

          // Listen for personality changes
          gptService.on('personalityChanged', async (changeData) => {
            console.log(`🎭 Personality adapted: ${changeData.from} → ${changeData.to}`.magenta);
            console.log(`📊 Reason: ${JSON.stringify(changeData.reason)}`.blue);
            
            // Log personality change to database
            try {
              await db.updateCallState(callSid, 'personality_changed', {
                from: changeData.from,
                to: changeData.to,
                reason: changeData.reason,
                interaction_count: interactionCount
              });
            } catch (dbError) {
              console.error('Database error logging personality change:', dbError);
            }
          });

          activeCalls.set(callSid, {
            startTime: callStartTime,
            transcripts: [],
            gptService,
            callConfig,
            functionSystem,
            personalityChanges: []
          });

          // Initialize call with recording
          try {
            await recordingService(ttsService, callSid);
            
            const firstMessage = callConfig ? 
              callConfig.first_message : 
              'Hello! what\'s your name and how can i help you today?';
            
            console.log(`🗣️ First message (${functionSystem?.context.industry || 'default'}): ${firstMessage.substring(0, 50)}...`.magenta);
            
            try {
              await db.addTranscript({
                call_sid: callSid,
                speaker: 'ai',
                message: firstMessage,
                interaction_count: 0,
                personality_used: 'default'
              });
            } catch (dbError) {
              console.error('Database error adding initial transcript:', dbError);
            }
            
            await ttsService.generate({
              partialResponseIndex: null, 
              partialResponse: firstMessage
            }, 0);
            
            isInitialized = true;
            console.log('✅ Adaptive call initialization complete'.green);
            
          } catch (recordingError) {
            console.error('❌ Recording service error:', recordingError);
            
            const firstMessage = callConfig ? 
              callConfig.first_message : 
              'Hello! what\'s your name and how can i help you today?';
            
            try {
              await db.addTranscript({
                call_sid: callSid,
                speaker: 'ai',
                message: firstMessage,
                interaction_count: 0,
                personality_used: 'default'
              });
            } catch (dbError) {
              console.error('Database error adding AI transcript:', dbError);
            }
            
            await ttsService.generate({
              partialResponseIndex: null, 
              partialResponse: firstMessage
            }, 0);
            
            isInitialized = true;
          }

          // Clean up old configurations
          const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
          for (const [sid, config] of callConfigurations.entries()) {
            if (new Date(config.created_at) < oneHourAgo) {
              callConfigurations.delete(sid);
              callFunctionSystems.delete(sid);
            }
          }

        } else if (msg.event === 'media') {
          if (isInitialized && transcriptionService) {
            transcriptionService.send(msg.media.payload);
          }
        } else if (msg.event === 'mark') {
          const label = msg.mark.name;
          marks = marks.filter(m => m !== msg.mark.name);
        } else if (msg.event === 'stop') {
          console.log(`🔚 Adaptive call stream ${streamSid} ended`.red);
          
          await handleCallEnd(callSid, callStartTime);
          
          // Clean up
          activeCalls.delete(callSid);
          if (callSid && callConfigurations.has(callSid)) {
            callConfigurations.delete(callSid);
            callFunctionSystems.delete(callSid);
            console.log(`🧹 Cleaned up adaptive configuration for call: ${callSid}`.yellow);
          }
        }
      } catch (messageError) {
        console.error('❌ Error processing WebSocket message:', messageError);
      }
    });
  
    transcriptionService.on('utterance', async (text) => {
      if(marks.length > 0 && text?.length > 5) {
        console.log('🔄 Interruption detected, clearing stream'.red);
        ws.send(
          JSON.stringify({
            streamSid,
            event: 'clear',
          })
        );
      }
    });
  
    transcriptionService.on('transcription', async (text) => {
      if (!text || !gptService || !isInitialized) { 
        return; 
      }
      
      console.log(`👤 Customer: ${text}`.yellow);
      
      // Save user transcript with enhanced context
      try {
        await db.addTranscript({
          call_sid: callSid,
          speaker: 'user',
          message: text,
          interaction_count: interactionCount
        });
        
        await db.updateCallState(callSid, 'user_spoke', {
          message: text,
          interaction_count: interactionCount
        });
      } catch (dbError) {
        console.error('Database error adding user transcript:', dbError);
      }
      
      // Process with adaptive personality and functions
      gptService.completion(text, interactionCount);
      interactionCount += 1;
    });
    
    ttsService.on('speech', (responseIndex, audio, label, icount) => {
      streamService.buffer(responseIndex, audio);
    });
  
    streamService.on('audiosent', (markLabel) => {
      marks.push(markLabel);
    });

    ws.on('close', () => {
      console.log(`🔌 WebSocket connection closed for adaptive call: ${callSid || 'unknown'}`.yellow);
    });

  } catch (err) {
    console.error('❌ WebSocket handler error:', err);
  }
});

// Enhanced call end handler with adaptation analytics
async function handleCallEnd(callSid, callStartTime) {
  try {
    const callEndTime = new Date();
    const duration = Math.round((callEndTime - callStartTime) / 1000);

    const transcripts = await db.getCallTranscripts(callSid);
    const summary = generateCallSummary(transcripts, duration);
    
    // Get personality adaptation data
    const callSession = activeCalls.get(callSid);
    let adaptationAnalysis = {};
    
    if (callSession && callSession.gptService) {
      const conversationAnalysis = callSession.gptService.getConversationAnalysis();
      adaptationAnalysis = {
        personalityChanges: conversationAnalysis.personalityChanges,
        finalPersonality: conversationAnalysis.currentPersonality,
        adaptationEffectiveness: conversationAnalysis.personalityChanges / Math.max(conversationAnalysis.totalInteractions / 10, 1),
        businessContext: callSession.functionSystem?.context || {}
      };
    }
    
    await db.updateCallStatus(callSid, 'completed', {
      ended_at: callEndTime.toISOString(),
      duration: duration,
      call_summary: summary.summary,
      ai_analysis: JSON.stringify({...summary.analysis, adaptation: adaptationAnalysis})
    });

    await db.updateCallState(callSid, 'call_ended', {
      end_time: callEndTime.toISOString(),
      duration: duration,
      total_interactions: transcripts.length,
      personality_adaptations: adaptationAnalysis.personalityChanges || 0
    });

    const callDetails = await db.getCall(callSid);
    
    // Create enhanced webhook notification for completion
    if (callDetails && callDetails.user_chat_id) {
      await db.createEnhancedWebhookNotification(callSid, 'call_completed', callDetails.user_chat_id);
      
      // Schedule transcript notification with delay
      setTimeout(async () => {
        try {
          await db.createEnhancedWebhookNotification(callSid, 'call_transcript', callDetails.user_chat_id);
        } catch (transcriptError) {
          console.error('Error creating transcript notification:', transcriptError);
        }
      }, 2000);
    }

    console.log(`✅ Enhanced adaptive call ${callSid} completed`.green);
    console.log(`📊 Duration: ${duration}s | Messages: ${transcripts.length} | Adaptations: ${adaptationAnalysis.personalityChanges || 0}`.cyan);
    if (adaptationAnalysis.finalPersonality) {
      console.log(`🎭 Final personality: ${adaptationAnalysis.finalPersonality}`.magenta);
    }

    // Log service health
    await db.logServiceHealth('call_system', 'call_completed', {
      call_sid: callSid,
      duration: duration,
      interactions: transcripts.length,
      adaptations: adaptationAnalysis.personalityChanges || 0
    });

  } catch (error) {
    console.error('Error handling enhanced adaptive call end:', error);
    
    // Log error to service health
    try {
      await db.logServiceHealth('call_system', 'error', {
        operation: 'handle_call_end',
        call_sid: callSid,
        error: error.message
      });
    } catch (logError) {
      console.error('Failed to log service health error:', logError);
    }
  }
}

function generateCallSummary(transcripts, duration) {
  if (!transcripts || transcripts.length === 0) {
    return {
      summary: 'No conversation recorded',
      analysis: { total_messages: 0, user_messages: 0, ai_messages: 0 }
    };
  }

  const userMessages = transcripts.filter(t => t.speaker === 'user');
  const aiMessages = transcripts.filter(t => t.speaker === 'ai');
  
  const analysis = {
    total_messages: transcripts.length,
    user_messages: userMessages.length,
    ai_messages: aiMessages.length,
    duration_seconds: duration,
    conversation_turns: Math.max(userMessages.length, aiMessages.length)
  };

  const summary = `Enhanced adaptive call completed with ${transcripts.length} messages over ${Math.round(duration/60)} minutes. ` +
    `User spoke ${userMessages.length} times, AI responded ${aiMessages.length} times.`;

  return { summary, analysis };
}

// Incoming endpoint used by Twilio to connect the call to our websocket stream
app.post('/incoming', (req, res) => {
  try {
    const response = new VoiceResponse();
    const connect = response.connect();
    connect.stream({ url: `wss://${process.env.SERVER}/connection` });

    res.type('text/xml');
    res.end(response.toString());
  } catch (err) {
    console.log(err);
    res.status(500).send('Error');
  }
});

// Enhanced outbound call endpoint with dynamic function generation
app.post('/outbound-call', async (req, res) => {
  try {
    const { number, prompt, first_message, user_chat_id } = req.body;

    if (!number || !prompt || !first_message) {
      return res.status(400).json({
        error: 'Missing required fields: number, prompt, and first_message are required'
      });
    }

    if (!number.match(/^\+[1-9]\d{1,14}$/)) {
      return res.status(400).json({
        error: 'Invalid phone number format. Use E.164 format (e.g., +1234567890)'
      });
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    
    if (!accountSid || !authToken) {
      return res.status(500).json({
        error: 'Twilio credentials not configured'
      });
    }

    console.log('🔧 Generating adaptive function system for call...'.blue);
    
    // Generate dynamic functions based on the prompt
    const functionSystem = functionEngine.generateAdaptiveFunctionSystem(prompt, first_message);
    
    console.log(`✅ Generated ${functionSystem.functions.length} functions for ${functionSystem.context.industry} industry`.green);

    const client = require('twilio')(accountSid, authToken);

    // Create the outbound call with enhanced callbacks
    const call = await client.calls.create({
      url: `https://${process.env.SERVER}/incoming`,
      to: number,
      from: process.env.FROM_NUMBER,
      statusCallback: `https://${process.env.SERVER}/webhook/call-status`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed', 'busy', 'no-answer', 'canceled', 'failed'],
      statusCallbackMethod: 'POST'
    });

    const callConfig = {
      prompt: prompt,
      first_message: first_message,
      created_at: new Date().toISOString(),
      user_chat_id: user_chat_id,
      business_context: functionSystem.context,
      function_count: functionSystem.functions.length
    };
    
    callConfigurations.set(call.sid, callConfig);
    
    // Store the generated function system for this call
    callFunctionSystems.set(call.sid, functionSystem);

    // Save call to database with enhanced metadata
    try {
      await db.createCall({
        call_sid: call.sid,
        phone_number: number,
        prompt: prompt,
        first_message: first_message,
        user_chat_id: user_chat_id,
        business_context: JSON.stringify(functionSystem.context),
        generated_functions: JSON.stringify(functionSystem.functions.map(f => f.function.name))
      });

      // Create initial webhook notification
      if (user_chat_id) {
        await db.createEnhancedWebhookNotification(call.sid, 'call_initiated', user_chat_id);
      }

      console.log(`📞 Enhanced adaptive call created: ${call.sid} to ${number}`.green);
      console.log(`🎯 Business context: ${functionSystem.context.industry} - ${functionSystem.context.businessType}`.cyan);
      
    } catch (dbError) {
      console.error('Database error:', dbError);
    }

    res.json({
      success: true,
      call_sid: call.sid,
      to: number,
      status: call.status,
      business_context: functionSystem.context,
      generated_functions: functionSystem.functions.length,
      function_types: functionSystem.functions.map(f => f.function.name),
      enhanced_webhooks: true
    });

  } catch (error) {
    console.error('Error creating enhanced adaptive outbound call:', error);
    res.status(500).json({
      error: 'Failed to create outbound call',
      details: error.message
    });
  }
});

// Enhanced webhook endpoint for call status updates

app.post('/webhook/call-status', async (req, res) => {
  try {
    const { 
      CallSid, 
      CallStatus, 
      Duration, 
      From, 
      To, 
      CallDuration,
      AnsweredBy,
      ErrorCode,
      ErrorMessage,
      DialCallDuration // This is key for detecting actual answer vs no-answer
    } = req.body;
    
    console.log(`📱 Fixed Webhook: Call ${CallSid} status: ${CallStatus}`.blue);
    console.log(`📊 Debug Info:`.cyan);
    console.log(`   Duration: ${Duration || 'N/A'}`);
    console.log(`   CallDuration: ${CallDuration || 'N/A'}`);
    console.log(`   DialCallDuration: ${DialCallDuration || 'N/A'}`);
    console.log(`   AnsweredBy: ${AnsweredBy || 'N/A'}`);
    
    // Get call details from database
    const call = await db.getCall(CallSid);
    if (!call) {
      console.warn(`⚠️ Webhook received for unknown call: ${CallSid}`.yellow);
      res.status(200).send('OK');
      return;
    }

    // Enhanced logic for determining actual call outcome
    let notificationType = null;
    let actualStatus = CallStatus.toLowerCase();
    
    // Special handling for "completed" status - check if it was actually answered
    if (actualStatus === 'completed') {
      const duration = parseInt(Duration || CallDuration || DialCallDuration || 0);
      
      console.log(`🔍 Analyzing completed call: Duration = ${duration}s`.yellow);
      
      // If call completed but duration is very short (< 3 seconds), it's likely no-answer
      // or if AnsweredBy is specifically 'machine_start' without actual conversation
      if (duration === 0 || duration < 3) {
        console.log(`❌ Short duration detected (${duration}s) - treating as no-answer`.red);
        actualStatus = 'no-answer';
        notificationType = 'call_no_answer';
      } else if (AnsweredBy === 'machine_start' && duration < 10) {
        console.log(`📞 Voicemail detected with short duration - treating as no-answer`.red);
        actualStatus = 'no-answer';
        notificationType = 'call_no_answer';
      } else {
        console.log(`✅ Valid call duration (${duration}s) - confirmed answered`.green);
        actualStatus = 'completed';
        notificationType = 'call_completed';
      }
    } else {
      // Handle other statuses normally
      switch (actualStatus) {
        case 'queued':
        case 'initiated':
          notificationType = 'call_initiated';
          break;
        case 'ringing':
          notificationType = 'call_ringing';
          break;
        case 'in-progress':
          notificationType = 'call_answered';
          break;
        case 'busy':
          notificationType = 'call_busy';
          break;
        case 'no-answer':
          notificationType = 'call_no_answer';
          break;
        case 'failed':
          notificationType = 'call_failed';
          break;
        case 'canceled':
          notificationType = 'call_canceled';
          break;
        default:
          console.warn(`⚠️ Unknown call status: ${CallStatus}`.yellow);
          notificationType = `call_${actualStatus}`;
      }
    }

    console.log(`🎯 Final determination: ${CallStatus} → ${actualStatus} → ${notificationType}`.green);

    // Update call status in database with enhanced data
    const updateData = {
      duration: parseInt(Duration || CallDuration || DialCallDuration || 0),
      twilio_status: CallStatus,
      answered_by: AnsweredBy,
      error_code: ErrorCode,
      error_message: ErrorMessage
    };

    // Calculate ring duration for no-answer cases
    if (actualStatus === 'no-answer' && call.created_at) {
      const callStart = new Date(call.created_at);
      const now = new Date();
      const ringDuration = Math.round((now - callStart) / 1000);
      updateData.ring_duration = ringDuration;
      console.log(`📞 Calculated ring duration: ${ringDuration}s`.cyan);
    }

    // Set timestamps based on actual status (not original CallStatus)
    if (actualStatus === 'in-progress' && !call.started_at) {
      updateData.started_at = new Date().toISOString();
    } else if (['completed', 'no-answer', 'failed', 'busy', 'canceled'].includes(actualStatus) && !call.ended_at) {
      updateData.ended_at = new Date().toISOString();
    }

    await db.updateCallStatus(CallSid, actualStatus, updateData);

    // Create enhanced webhook notification with corrected status
    if (call.user_chat_id && notificationType) {
      try {
        await db.createEnhancedWebhookNotification(CallSid, notificationType, call.user_chat_id);
        console.log(`📨 Created corrected ${notificationType} notification for call ${CallSid}`.green);
        
        // Log the correction if we changed the status
        if (actualStatus !== CallStatus.toLowerCase()) {
          await db.logServiceHealth('webhook_system', 'status_corrected', {
            call_sid: CallSid,
            original_status: CallStatus,
            corrected_status: actualStatus,
            duration: updateData.duration,
            reason: 'Short duration analysis'
          });
        }
      } catch (notificationError) {
        console.error('Error creating enhanced webhook notification:', notificationError);
      }
    }
    
    // Log comprehensive status update
    console.log(`✅ Fixed webhook processed: ${CallSid} -> ${CallStatus} (corrected to: ${actualStatus})`.green);
    if (updateData.duration) {
      const minutes = Math.floor(updateData.duration / 60);
      const seconds = updateData.duration % 60;
      console.log(`📊 Call metrics: ${minutes}:${String(seconds).padStart(2, '0')} duration`.cyan);
    }

    // Log to service health with correction info
    await db.logServiceHealth('webhook_system', 'status_received', {
      call_sid: CallSid,
      original_status: CallStatus,
      final_status: actualStatus,
      duration: updateData.duration,
      answered_by: AnsweredBy,
      correction_applied: actualStatus !== CallStatus.toLowerCase()
    });
    
    res.status(200).send('OK');
    
  } catch (error) {
    console.error('❌ Error processing fixed call status webhook:', error);
    
    // Log error to service health
    try {
      await db.logServiceHealth('webhook_system', 'error', {
        operation: 'process_webhook',
        error: error.message,
        call_sid: req.body.CallSid
      });
    } catch (logError) {
      console.error('Failed to log webhook error:', logError);
    }
    
    res.status(200).send('OK');
  }
});


// Enhanced API endpoints with adaptation analytics

// Get call details with enhanced personality and function analytics
app.get('/api/calls/:callSid', async (req, res) => {
  try {
    const { callSid } = req.params;
    
    const call = await db.getCall(callSid);
    if (!call) {
      return res.status(404).json({ error: 'Call not found' });
    }

    const transcripts = await db.getCallTranscripts(callSid);
    
    // Parse adaptation data
    let adaptationData = {};
    try {
      if (call.ai_analysis) {
        const analysis = JSON.parse(call.ai_analysis);
        adaptationData = analysis.adaptation || {};
      }
    } catch (e) {
      console.error('Error parsing adaptation data:', e);
    }

    // Get webhook notifications for this call
    const webhookNotifications = await new Promise((resolve, reject) => {
      db.db.all(
        `SELECT * FROM webhook_notifications WHERE call_sid = ? ORDER BY created_at DESC`,
        [callSid],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
    
    res.json({
      call,
      transcripts,
      transcript_count: transcripts.length,
      adaptation_analytics: adaptationData,
      business_context: call.business_context ? JSON.parse(call.business_context) : null,
      webhook_notifications: webhookNotifications,
      enhanced_features: true
    });
  } catch (error) {
    console.error('Error fetching enhanced adaptive call details:', error);
    res.status(500).json({ error: 'Failed to fetch call details' });
  }
});

// Enhanced call status endpoint with real-time metrics
app.get('/api/calls/:callSid/status', async (req, res) => {
  try {
    const { callSid } = req.params;
    
    const call = await db.getCall(callSid);
    if (!call) {
      return res.status(404).json({ error: 'Call not found' });
    }

    // Get recent call states for detailed progress tracking
    const recentStates = await new Promise((resolve, reject) => {
      db.db.all(
        `SELECT state, data, timestamp FROM call_states 
         WHERE call_sid = ? 
         ORDER BY timestamp DESC 
         LIMIT 10`,
        [callSid],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });

    // Get enhanced webhook notification status
    const notificationStatus = await new Promise((resolve, reject) => {
      db.db.all(
        `SELECT notification_type, status, created_at, sent_at, delivery_time_ms, error_message 
         FROM webhook_notifications 
         WHERE call_sid = ? 
         ORDER BY created_at DESC`,
        [callSid],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });

    // Calculate enhanced call timing metrics
    let timingMetrics = {};
    if (call.created_at) {
      const now = new Date();
      const created = new Date(call.created_at);
      timingMetrics.total_elapsed = Math.round((now - created) / 1000);
      
      if (call.started_at) {
        const started = new Date(call.started_at);
        timingMetrics.time_to_answer = Math.round((started - created) / 1000);
      }
      
      if (call.ended_at) {
        const ended = new Date(call.ended_at);
        timingMetrics.call_duration = call.duration || Math.round((ended - new Date(call.started_at || call.created_at)) / 1000);
      }

      // Calculate ring duration if available
      if (call.ring_duration) {
        timingMetrics.ring_duration = call.ring_duration;
      }
    }

    res.json({
      call: {
        ...call,
        timing_metrics: timingMetrics
      },
      recent_states: recentStates,
      notification_status: notificationStatus,
      webhook_service_status: webhookService.getCallStatusStats(),
      enhanced_tracking: true
    });
    
  } catch (error) {
    console.error('Error fetching enhanced call status:', error);
    res.status(500).json({ error: 'Failed to fetch call status' });
  }
});

// Manual notification trigger endpoint (for testing)
app.post('/api/calls/:callSid/notify', async (req, res) => {
  try {
    const { callSid } = req.params;
    const { status, user_chat_id } = req.body;
    
    if (!status || !user_chat_id) {
      return res.status(400).json({ 
        error: 'Both status and user_chat_id are required' 
      });
    }

    const call = await db.getCall(callSid);
    if (!call) {
      return res.status(404).json({ error: 'Call not found' });
    }

    // Send immediate enhanced notification
    const success = await webhookService.sendImmediateStatus(callSid, status, user_chat_id);
    
    if (success) {
      res.json({ 
        success: true, 
        message: `Enhanced manual notification sent: ${status}`,
        call_sid: callSid,
        enhanced: true
      });
    } else {
      res.status(500).json({ 
        success: false, 
        error: 'Failed to send enhanced notification' 
      });
    }
    
  } catch (error) {
    console.error('Error sending enhanced manual notification:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to send notification',
      details: error.message 
    });
  }
});

// Get enhanced adaptation analytics dashboard data
app.get('/api/analytics/adaptations', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const calls = await db.getCallsWithTranscripts(limit);
    
    const analyticsData = {
      total_calls: calls.length,
      calls_with_adaptations: 0,
      total_adaptations: 0,
      personality_usage: {},
      industry_breakdown: {},
      adaptation_triggers: {},
      enhanced_features: true
    };

    calls.forEach(call => {
      try {
        if (call.ai_analysis) {
          const analysis = JSON.parse(call.ai_analysis);
          if (analysis.adaptation && analysis.adaptation.personalityChanges > 0) {
            analyticsData.calls_with_adaptations++;
            analyticsData.total_adaptations += analysis.adaptation.personalityChanges;
            
            // Track final personality usage
            const finalPersonality = analysis.adaptation.finalPersonality;
            if (finalPersonality) {
              analyticsData.personality_usage[finalPersonality] = 
                (analyticsData.personality_usage[finalPersonality] || 0) + 1;
            }
            
            // Track industry usage
            const industry = analysis.adaptation.businessContext?.industry;
            if (industry) {
              analyticsData.industry_breakdown[industry] = 
                (analyticsData.industry_breakdown[industry] || 0) + 1;
            }
          }
        }
      } catch (e) {
        // Skip calls with invalid analysis data
      }
    });

    analyticsData.adaptation_rate = analyticsData.total_calls > 0 ? 
      (analyticsData.calls_with_adaptations / analyticsData.total_calls * 100).toFixed(1) : 0;
    
    analyticsData.avg_adaptations_per_call = analyticsData.calls_with_adaptations > 0 ? 
      (analyticsData.total_adaptations / analyticsData.calls_with_adaptations).toFixed(1) : 0;

    res.json(analyticsData);
  } catch (error) {
    console.error('Error fetching enhanced adaptation analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// Enhanced notification analytics endpoint
app.get('/api/analytics/notifications', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const hours = parseInt(req.query.hours) || 24;
    
    const notificationStats = await new Promise((resolve, reject) => {
      db.db.all(`
        SELECT 
          notification_type,
          status,
          COUNT(*) as count,
          AVG(CASE 
            WHEN sent_at IS NOT NULL AND created_at IS NOT NULL 
            THEN (julianday(sent_at) - julianday(created_at)) * 86400 
            ELSE NULL 
          END) as avg_delivery_time_seconds,
          AVG(delivery_time_ms) as avg_delivery_time_ms
        FROM webhook_notifications 
        WHERE created_at >= datetime('now', '-${hours} hours')
        GROUP BY notification_type, status
        ORDER BY notification_type, status
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

    const recentNotifications = await new Promise((resolve, reject) => {
      db.db.all(`
        SELECT 
          wn.*,
          c.phone_number,
          c.status as call_status,
          c.twilio_status
        FROM webhook_notifications wn
        LEFT JOIN calls c ON wn.call_sid = c.call_sid
        WHERE wn.created_at >= datetime('now', '-${hours} hours')
        ORDER BY wn.created_at DESC
        LIMIT ${limit}
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

    // Calculate enhanced summary metrics
    const totalNotifications = notificationStats.reduce((sum, stat) => sum + stat.count, 0);
    const successfulNotifications = notificationStats
      .filter(stat => stat.status === 'sent')
      .reduce((sum, stat) => sum + stat.count, 0);
    
    const successRate = totalNotifications > 0 ? 
      ((successfulNotifications / totalNotifications) * 100).toFixed(1) : 0;

    const avgDeliveryTime = notificationStats
      .filter(stat => stat.avg_delivery_time_seconds !== null)
      .reduce((sum, stat, _, arr) => {
        return sum + (stat.avg_delivery_time_seconds / arr.length);
      }, 0);

    // Get notification metrics from database
    const notificationMetrics = await db.getNotificationAnalytics(Math.ceil(hours / 24));

    res.json({
      summary: {
        total_notifications: totalNotifications,
        successful_notifications: successfulNotifications,
        success_rate_percent: parseFloat(successRate),
        average_delivery_time_seconds: avgDeliveryTime.toFixed(2),
        time_period_hours: hours,
        enhanced_tracking: true
      },
      notification_breakdown: notificationStats,
      recent_notifications: recentNotifications,
      historical_metrics: notificationMetrics,
      webhook_service_health: await webhookService.healthCheck()
    });
    
  } catch (error) {
    console.error('Error fetching enhanced notification analytics:', error);
    res.status(500).json({ 
      error: 'Failed to fetch notification analytics',
      details: error.message 
    });
  }
});

// Generate functions for a given prompt (testing endpoint)
app.post('/api/generate-functions', async (req, res) => {
  try {
    const { prompt, first_message } = req.body;
    
    if (!prompt || !first_message) {
      return res.status(400).json({ error: 'Both prompt and first_message are required' });
    }

    const functionSystem = functionEngine.generateAdaptiveFunctionSystem(prompt, first_message);
    
    res.json({
      success: true,
      business_context: functionSystem.context,
      functions: functionSystem.functions,
      function_count: functionSystem.functions.length,
      analysis: functionEngine.getBusinessAnalysis(),
      enhanced: true
    });
  } catch (error) {
    console.error('Error generating enhanced functions:', error);
    res.status(500).json({ error: 'Failed to generate functions' });
  }
});

// Enhanced health endpoint with comprehensive system status
app.get('/health', async (req, res) => {
  try {
    const calls = await db.getCallsWithTranscripts(1);
    const webhookHealth = await webhookService.healthCheck();
    const callStats = webhookService.getCallStatusStats();
    const notificationMetrics = await db.getNotificationAnalytics(1);
    
    // Check service health logs
    const recentHealthLogs = await new Promise((resolve, reject) => {
      db.db.all(`
        SELECT service_name, status, COUNT(*) as count
        FROM service_health_logs 
        WHERE timestamp >= datetime('now', '-1 hour')
        GROUP BY service_name, status
        ORDER BY service_name
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
    
    res.json({ 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      enhanced_features: true,
      services: {
        database: {
          connected: true,
          recent_calls: calls.length
        },
        webhook_service: webhookHealth,
        call_tracking: callStats,
        notification_system: {
          total_today: notificationMetrics.total_notifications,
          success_rate: notificationMetrics.overall_success_rate + '%',
          avg_delivery_time: notificationMetrics.breakdown.length > 0 ? 
            notificationMetrics.breakdown[0].avg_delivery_time + 'ms' : 'N/A'
        }
      },
      active_calls: callConfigurations.size,
      adaptation_engine: {
        available_templates: functionEngine ? functionEngine.getBusinessAnalysis().availableTemplates.length : 0,
        active_function_systems: callFunctionSystems.size
      },
      system_health: recentHealthLogs
    });
  } catch (error) {
    console.error('Enhanced health check error:', error);
    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      enhanced_features: true,
      error: error.message,
      services: {
        database: {
          connected: false,
          error: error.message
        },
        webhook_service: {
          status: 'error',
          reason: 'Database connection failed'
        }
      }
    });
  }
});

// Enhanced system maintenance endpoint
app.post('/api/system/cleanup', async (req, res) => {
  try {
    const { days_to_keep = 30 } = req.body;
    
    console.log(`🧹 Starting enhanced system cleanup (keeping ${days_to_keep} days)...`.yellow);
    
    const cleanedRecords = await db.cleanupOldRecords(days_to_keep);
    
    // Log cleanup operation
    await db.logServiceHealth('system_maintenance', 'cleanup_completed', {
      records_cleaned: cleanedRecords,
      days_kept: days_to_keep
    });
    
    res.json({
      success: true,
      records_cleaned: cleanedRecords,
      days_kept: days_to_keep,
      timestamp: new Date().toISOString(),
      enhanced: true
    });
    
  } catch (error) {
    console.error('Error during enhanced system cleanup:', error);
    
    await db.logServiceHealth('system_maintenance', 'cleanup_failed', {
      error: error.message
    });
    
    res.status(500).json({
      success: false,
      error: 'System cleanup failed',
      details: error.message
    });
  }
});

// Basic calls list endpoint
app.get('/api/calls', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 50); // Max 50 calls
    const offset = parseInt(req.query.offset) || 0;
    
    console.log(`Fetching calls list: limit=${limit}, offset=${offset}`);
    
    // Get calls from database using the new method
    const calls = await db.getRecentCalls(limit, offset);
    const totalCount = await db.getCallsCount();

    // Format the response with enhanced data
    const formattedCalls = calls.map(call => ({
      ...call,
      transcript_count: call.transcript_count || 0,
      created_date: new Date(call.created_at).toLocaleDateString(),
      duration_formatted: call.duration ? 
        `${Math.floor(call.duration/60)}:${String(call.duration%60).padStart(2,'0')}` : 
        'N/A',
      // Parse JSON fields safely
      business_context: call.business_context ? 
        (() => { try { return JSON.parse(call.business_context); } catch { return null; } })() : 
        null,
      generated_functions: call.generated_functions ?
        (() => { try { return JSON.parse(call.generated_functions); } catch { return []; } })() :
        []
    }));

    res.json({
      success: true,
      calls: formattedCalls,
      pagination: {
        total: totalCount,
        limit: limit,
        offset: offset,
        has_more: offset + limit < totalCount
      },
      enhanced_features: true
    });

  } catch (error) {
    console.error('Error fetching calls list:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch calls list',
      details: error.message
    });
  }
});

// Enhanced calls list endpoint with filters
app.get('/api/calls/list', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const offset = parseInt(req.query.offset) || 0;
    const status = req.query.status; // Filter by status
    const phone = req.query.phone; // Filter by phone number
    const dateFrom = req.query.date_from; // Filter by date range
    const dateTo = req.query.date_to;

    let whereClause = '';
    let queryParams = [];
    
    // Build dynamic where clause
    const conditions = [];
    
    if (status) {
      conditions.push('c.status = ?');
      queryParams.push(status);
    }
    
    if (phone) {
      conditions.push('c.phone_number LIKE ?');
      queryParams.push(`%${phone}%`);
    }
    
    if (dateFrom) {
      conditions.push('c.created_at >= ?');
      queryParams.push(dateFrom);
    }
    
    if (dateTo) {
      conditions.push('c.created_at <= ?');
      queryParams.push(dateTo);
    }
    
    if (conditions.length > 0) {
      whereClause = 'WHERE ' + conditions.join(' AND ');
    }

    const query = `
      SELECT 
        c.*,
        COUNT(t.id) as transcript_count,
        GROUP_CONCAT(DISTINCT t.speaker) as speakers,
        MIN(t.timestamp) as conversation_start,
        MAX(t.timestamp) as conversation_end
      FROM calls c
      LEFT JOIN transcripts t ON c.call_sid = t.call_sid
      ${whereClause}
      GROUP BY c.call_sid
      ORDER BY c.created_at DESC
      LIMIT ? OFFSET ?
    `;

    queryParams.push(limit, offset);
    
    const calls = await new Promise((resolve, reject) => {
      db.db.all(query, queryParams, (err, rows) => {
        if (err) {
          console.error('Database error in enhanced calls query:', err);
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });

    // Get filtered count
    const countQuery = `SELECT COUNT(*) as count FROM calls c ${whereClause}`;
    const totalCount = await new Promise((resolve, reject) => {
      db.db.get(countQuery, queryParams.slice(0, -2), (err, row) => {
        if (err) {
          console.error('Database error counting filtered calls:', err);
          resolve(0);
        } else {
          resolve(row?.count || 0);
        }
      });
    });

    // Enhanced formatting
    const enhancedCalls = calls.map(call => {
      const hasConversation = call.speakers && call.speakers.includes('user') && call.speakers.includes('ai');
      const conversationDuration = call.conversation_start && call.conversation_end ?
        Math.round((new Date(call.conversation_end) - new Date(call.conversation_start)) / 1000) : 0;

      return {
        call_sid: call.call_sid,
        phone_number: call.phone_number,
        status: call.status,
        twilio_status: call.twilio_status,
        created_at: call.created_at,
        started_at: call.started_at,
        ended_at: call.ended_at,
        duration: call.duration,
        transcript_count: call.transcript_count || 0,
        has_conversation: hasConversation,
        conversation_duration: conversationDuration,
        call_summary: call.call_summary,
        user_chat_id: call.user_chat_id,
        // Enhanced metadata
        business_context: call.business_context ? 
          (() => { try { return JSON.parse(call.business_context); } catch { return null; } })() : null,
        generated_functions_count: call.generated_functions ?
          (() => { try { return JSON.parse(call.generated_functions).length; } catch { return 0; } })() : 0,
        // Formatted fields
        created_date: new Date(call.created_at).toLocaleDateString(),
        created_time: new Date(call.created_at).toLocaleTimeString(),
        duration_formatted: call.duration ? 
          `${Math.floor(call.duration/60)}:${String(call.duration%60).padStart(2,'0')}` : 'N/A',
        status_icon: getStatusIcon(call.status),
        enhanced: true
      };
    });

    res.json({
      success: true,
      calls: enhancedCalls,
      filters: {
        status,
        phone,
        date_from: dateFrom,
        date_to: dateTo
      },
      pagination: {
        total: totalCount,
        limit: limit,
        offset: offset,
        has_more: offset + limit < totalCount,
        current_page: Math.floor(offset / limit) + 1,
        total_pages: Math.ceil(totalCount / limit)
      },
      enhanced_features: true
    });

  } catch (error) {
    console.error('Error in enhanced calls list:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch enhanced calls list',
      details: error.message
    });
  }
});

// Helper function for status icons
function getStatusIcon(status) {
  const icons = {
    'completed': '✅',
    'no-answer': '📵',
    'busy': '📞',
    'failed': '❌',
    'canceled': '🚫',
    'in-progress': '🔄',
    'ringing': '📲'
  };
  return icons[status] || '❓';
}

// Add calls analytics endpoint
app.get('/api/calls/analytics', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const dateFrom = new Date(Date.now() - (days * 24 * 60 * 60 * 1000)).toISOString();

    // Get comprehensive analytics
    const analytics = await new Promise((resolve, reject) => {
      const queries = {
        // Total calls in period
        totalCalls: `SELECT COUNT(*) as count FROM calls WHERE created_at >= ?`,
        
        // Calls by status
        statusBreakdown: `
          SELECT status, COUNT(*) as count 
          FROM calls 
          WHERE created_at >= ? 
          GROUP BY status 
          ORDER BY count DESC
        `,
        
        // Average call duration
        avgDuration: `
          SELECT AVG(duration) as avg_duration 
          FROM calls 
          WHERE created_at >= ? AND duration > 0
        `,
        
        // Success rate (completed calls with conversation)
        successRate: `
          SELECT 
            COUNT(CASE WHEN c.status = 'completed' AND t.transcript_count > 0 THEN 1 END) as successful,
            COUNT(*) as total
          FROM calls c
          LEFT JOIN (
            SELECT call_sid, COUNT(*) as transcript_count 
            FROM transcripts 
            WHERE speaker = 'user' 
            GROUP BY call_sid
          ) t ON c.call_sid = t.call_sid
          WHERE c.created_at >= ?
        `,
        
        // Daily call volume
        dailyVolume: `
          SELECT 
            DATE(created_at) as date,
            COUNT(*) as calls,
            COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed
          FROM calls 
          WHERE created_at >= ? 
          GROUP BY DATE(created_at) 
          ORDER BY date DESC
        `
      };

      const results = {};
      let completed = 0;
      const total = Object.keys(queries).length;

      for (const [key, query] of Object.entries(queries)) {
        db.db.all(query, [dateFrom], (err, rows) => {
          if (err) {
            console.error(`Analytics query error for ${key}:`, err);
            results[key] = null;
          } else {
            results[key] = rows;
          }
          
          completed++;
          if (completed === total) {
            resolve(results);
          }
        });
      }
    });

    // Process analytics data
    const processedAnalytics = {
      period: {
        days: days,
        from: dateFrom,
        to: new Date().toISOString()
      },
      summary: {
        total_calls: analytics.totalCalls?.[0]?.count || 0,
        average_duration: analytics.avgDuration?.[0]?.avg_duration ? 
          Math.round(analytics.avgDuration[0].avg_duration) : 0,
        success_rate: analytics.successRate?.[0] ? 
          Math.round((analytics.successRate[0].successful / analytics.successRate[0].total) * 100) : 0
      },
      status_breakdown: analytics.statusBreakdown || [],
      daily_volume: analytics.dailyVolume || [],
      enhanced_features: true
    };

    res.json(processedAnalytics);

  } catch (error) {
    console.error('Error fetching call analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch analytics',
      details: error.message
    });
  }
});

// Search calls endpoint
app.get('/api/calls/search', async (req, res) => {
  try {
    const query = req.query.q;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    
    if (!query || query.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Search query must be at least 2 characters'
      });
    }

    // Search in calls and transcripts
    const searchResults = await new Promise((resolve, reject) => {
      const searchQuery = `
        SELECT DISTINCT
          c.*,
          COUNT(t.id) as transcript_count,
          GROUP_CONCAT(t.message, ' ') as conversation_text
        FROM calls c
        LEFT JOIN transcripts t ON c.call_sid = t.call_sid
        WHERE 
          c.phone_number LIKE ? OR
          c.call_summary LIKE ? OR
          c.prompt LIKE ? OR
          c.first_message LIKE ? OR
          t.message LIKE ?
        GROUP BY c.call_sid
        ORDER BY c.created_at DESC
        LIMIT ?
      `;
      
      const searchTerm = `%${query}%`;
      const params = [searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, limit];
      
      db.db.all(searchQuery, params, (err, rows) => {
        if (err) {
          console.error('Search query error:', err);
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });

    const formattedResults = searchResults.map(call => ({
      call_sid: call.call_sid,
      phone_number: call.phone_number,
      status: call.status,
      created_at: call.created_at,
      duration: call.duration,
      transcript_count: call.transcript_count || 0,
      call_summary: call.call_summary,
      // Highlight matching text (basic implementation)
      matching_text: call.conversation_text ? 
        call.conversation_text.substring(0, 200) + '...' : null,
      created_date: new Date(call.created_at).toLocaleDateString(),
      duration_formatted: call.duration ? 
        `${Math.floor(call.duration/60)}:${String(call.duration%60).padStart(2,'0')}` : 'N/A'
    }));

    res.json({
      success: true,
      query: query,
      results: formattedResults,
      result_count: formattedResults.length,
      enhanced_search: true
    });

  } catch (error) {
    console.error('Error in call search:', error);
    res.status(500).json({
      success: false,
      error: 'Search failed',
      details: error.message
    });
  }
});

// SMS webhook endpoints
app.post('/webhook/sms', async (req, res) => {
    try {
        const { From, Body, MessageSid, SmsStatus } = req.body;

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
    } catch (error) {
        console.error('❌ SMS webhook error:', error);
        res.status(500).send('Error');
    }
});

app.post('/webhook/sms-status', async (req, res) => {
    try {
        const { MessageSid, MessageStatus, ErrorCode, ErrorMessage } = req.body;

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
    } catch (error) {
        console.error('❌ SMS status webhook error:', error);
        res.status(500).send('OK'); // Return OK to prevent retries
    }
});

// Send single SMS endpoint
app.post('/api/sms/send', async (req, res) => {
    try {
        const { to, message, from, user_chat_id } = req.body;

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
    } catch (error) {
        console.error('❌ SMS send error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to send SMS',
            details: error.message
        });
    }
});

// Send bulk SMS endpoint
app.post('/api/sms/bulk', async (req, res) => {
    try {
        const { recipients, message, options = {}, user_chat_id } = req.body;

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
    } catch (error) {
        console.error('❌ Bulk SMS error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to send bulk SMS',
            details: error.message
        });
    }
});

// Schedule SMS endpoint
app.post('/api/sms/schedule', async (req, res) => {
    try {
        const { to, message, scheduled_time, options = {} } = req.body;

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
    } catch (error) {
        console.error('❌ SMS schedule error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to schedule SMS',
            details: error.message
        });
    }
});

// SMS templates endpoint
app.get('/api/sms/templates', async (req, res) => {
    try {
        const { template_name, variables } = req.query;

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
    } catch (error) {
        console.error('❌ SMS templates error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get templates'
        });
    }
});

// Get SMS messages from database for conversation view
app.get('/api/sms/messages/conversation/:phone', async (req, res) => {
    try {
        const { phone } = req.params;
        const limit = Math.min(parseInt(req.query.limit) || 50, 100);

        if (!phone) {
            return res.status(400).json({
                success: false,
                error: 'Phone number is required'
            });
        }

        const messages = await db.getSMSConversation(phone, limit);

        res.json({
            success: true,
            phone: phone,
            messages: messages,
            message_count: messages.length
        });

    } catch (error) {
        console.error('❌ Error fetching SMS conversation from database:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch conversation',
            details: error.message
        });
    }
});

// Get recent SMS messages from database
app.get('/api/sms/messages/recent', async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 10, 50);
        const offset = parseInt(req.query.offset) || 0;

        const messages = await db.getSMSMessages(limit, offset);

        res.json({
            success: true,
            messages: messages,
            count: messages.length,
            limit: limit,
            offset: offset
        });

    } catch (error) {
        console.error('❌ Error fetching recent SMS messages:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch recent messages',
            details: error.message
        });
    }
});

// Get SMS database statistics
app.get('/api/sms/database-stats', async (req, res) => {
    try {
        const hours = parseInt(req.query.hours) || 24;
        const dateFrom = new Date(Date.now() - (hours * 60 * 60 * 1000)).toISOString();

        // Get comprehensive SMS statistics from database
        const stats = await new Promise((resolve, reject) => {
            const queries = {
                // Total messages
                totalMessages: `SELECT COUNT(*) as count FROM sms_messages`,
                
                // Messages by direction
                messagesByDirection: `
                    SELECT direction, COUNT(*) as count 
                    FROM sms_messages 
                    GROUP BY direction
                `,
                
                // Messages by status
                messagesByStatus: `
                    SELECT status, COUNT(*) as count 
                    FROM sms_messages 
                    GROUP BY status
                    ORDER BY count DESC
                `,
                
                // Recent messages
                recentMessages: `
                    SELECT * FROM sms_messages 
                    WHERE created_at >= ?
                    ORDER BY created_at DESC 
                    LIMIT 5
                `,
                
                // Bulk operations
                bulkOperations: `SELECT COUNT(*) as count FROM bulk_sms_operations`,
                
                // Recent bulk operations
                recentBulkOps: `
                    SELECT * FROM bulk_sms_operations 
                    WHERE created_at >= ?
                    ORDER BY created_at DESC 
                    LIMIT 3
                `
            };

            const results = {};
            let completed = 0;
            const total = Object.keys(queries).length;

            for (const [key, query] of Object.entries(queries)) {
                const params = ['recentMessages', 'recentBulkOps'].includes(key) ? [dateFrom] : [];
                
                db.db.all(query, params, (err, rows) => {
                    if (err) {
                        console.error(`SMS stats query error for ${key}:`, err);
                        results[key] = key.includes('recent') ? [] : [{ count: 0 }];
                    } else {
                        results[key] = rows || [];
                    }
                    
                    completed++;
                    if (completed === total) {
                        resolve(results);
                    }
                });
            }
        });

        // Process the statistics
        const processedStats = {
            total_messages: stats.totalMessages[0]?.count || 0,
            sent_messages: stats.messagesByDirection.find(d => d.direction === 'outbound')?.count || 0,
            received_messages: stats.messagesByDirection.find(d => d.direction === 'inbound')?.count || 0,
            delivered_count: stats.messagesByStatus.find(s => s.status === 'delivered')?.count || 0,
            failed_count: stats.messagesByStatus.find(s => s.status === 'failed')?.count || 0,
            pending_count: stats.messagesByStatus.find(s => s.status === 'pending')?.count || 0,
            bulk_operations: stats.bulkOperations[0]?.count || 0,
            recent_messages: stats.recentMessages || [],
            recent_bulk_operations: stats.recentBulkOps || [],
            status_breakdown: stats.messagesByStatus || [],
            direction_breakdown: stats.messagesByDirection || [],
            time_period_hours: hours
        };

        // Calculate success rate
        const totalSent = processedStats.sent_messages;
        const delivered = processedStats.delivered_count;
        processedStats.success_rate = totalSent > 0 ? 
            Math.round((delivered / totalSent) * 100) : 0;

        res.json({
            success: true,
            ...processedStats
        });

    } catch (error) {
        console.error('❌ Error fetching SMS database statistics:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch database statistics',
            details: error.message
        });
    }
});

// Get SMS status by message SID
app.get('/api/sms/status/:messageSid', async (req, res) => {
    try {
        const { messageSid } = req.params;

        const message = await new Promise((resolve, reject) => {
            db.db.get(
                `SELECT * FROM sms_messages WHERE message_sid = ?`,
                [messageSid],
                (err, row) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(row);
                    }
                }
            );
        });

        if (!message) {
            return res.status(404).json({
                success: false,
                error: 'Message not found'
            });
        }

        res.json({
            success: true,
            message: message
        });

    } catch (error) {
        console.error('❌ Error fetching SMS status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch message status',
            details: error.message
        });
    }
});

// Enhanced SMS templates endpoint with better error handling
app.get('/api/sms/templates/:templateName?', async (req, res) => {
    try {
        const { templateName } = req.params;
        const { variables } = req.query;

        // Built-in templates (fallback)
        const builtInTemplates = {
            welcome: 'Welcome to our service! We\'re excited to have you aboard. Reply HELP for assistance or STOP to unsubscribe.',
            appointment_reminder: 'Reminder: You have an appointment on {date} at {time}. Reply CONFIRM to confirm or RESCHEDULE to change.',
            verification: 'Your verification code is: {code}. This code will expire in 10 minutes. Do not share this code with anyone.',
            order_update: 'Order #{order_id} update: {status}. Track your order at {tracking_url}',
            payment_reminder: 'Payment reminder: Your payment of {amount} is due on {due_date}. Pay now: {payment_url}',
            promotional: '🎉 Special offer just for you! {offer_text} Use code {promo_code}. Valid until {expiry_date}. Reply STOP to opt out.',
            customer_service: 'Thanks for contacting us! We\'ve received your message and will respond within 24 hours. For urgent matters, call {phone}.',
            survey: 'How was your experience with us? Rate us 1-5 stars by replying with a number. Your feedback helps us improve!'
        };

        if (templateName) {
            // Get specific template
            if (!builtInTemplates[templateName]) {
                return res.status(404).json({
                    success: false,
                    error: `Template '${templateName}' not found`
                });
            }

            let template = builtInTemplates[templateName];
            let parsedVariables = {};

            // Parse and apply variables if provided
            if (variables) {
                try {
                    parsedVariables = JSON.parse(variables);
                    
                    // Replace variables in template
                    for (const [key, value] of Object.entries(parsedVariables)) {
                        template = template.replace(new RegExp(`{${key}}`, 'g'), value);
                    }
                } catch (parseError) {
                    console.error('Error parsing template variables:', parseError);
                    // Continue with template without variable substitution
                }
            }

            res.json({
                success: true,
                template_name: templateName,
                template: template,
                original_template: builtInTemplates[templateName],
                variables: parsedVariables
            });

        } else {
            // Get list of available templates
            res.json({
                success: true,
                available_templates: Object.keys(builtInTemplates),
                template_count: Object.keys(builtInTemplates).length
            });
        }

    } catch (error) {
        console.error('❌ Error handling SMS templates:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to process template request',
            details: error.message
        });
    }
});

// SMS webhook delivery status notifications (enhanced)
app.post('/webhook/sms-delivery', async (req, res) => {
    try {
        const { MessageSid, MessageStatus, ErrorCode, ErrorMessage, To, From } = req.body;

        console.log(`📱 SMS Delivery Status: ${MessageSid} -> ${MessageStatus}`);

        // Update message status in database
        if (db) {
            await db.updateSMSStatus(MessageSid, {
                status: MessageStatus,
                error_code: ErrorCode,
                error_message: ErrorMessage
            });

            // Get the original message to find user_chat_id for notification
            const message = await new Promise((resolve, reject) => {
                db.db.get(
                    `SELECT * FROM sms_messages WHERE message_sid = ?`,
                    [MessageSid],
                    (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    }
                );
            });

            // Create webhook notification if user_chat_id exists
            if (message && message.user_chat_id) {
                const notificationType = MessageStatus === 'delivered' ? 'sms_delivered' :
                                       MessageStatus === 'failed' ? 'sms_failed' :
                                       `sms_${MessageStatus}`;

                await db.createEnhancedWebhookNotification(
                    MessageSid,
                    notificationType,
                    message.user_chat_id,
                    MessageStatus === 'failed' ? 'high' : 'normal'
                );

                console.log(`📨 Created ${notificationType} notification for user ${message.user_chat_id}`);
            }
        }

        res.status(200).send('OK');
    } catch (error) {
        console.error('❌ SMS delivery webhook error:', error);
        res.status(200).send('OK'); // Always return 200 to prevent retries
    }
});

// Get SMS statistics
app.get('/api/sms/stats', async (req, res) => {
  try {
    const stats = smsService.getStatistics();
    const activeConversations = smsService.getActiveConversations();
    
    res.json({
      success: true,
      statistics: stats,
      active_conversations: activeConversations.slice(0, 20), // Last 20 conversations
      sms_service_enabled: true
    });
    
  } catch (error) {
    console.error('❌ SMS stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get SMS statistics'
    });
  }
});

// Bulk SMS status endpoint
app.get('/api/sms/bulk/status', async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 10, 50);
        const hours = parseInt(req.query.hours) || 24;
        const dateFrom = new Date(Date.now() - (hours * 60 * 60 * 1000)).toISOString();

        const bulkOperations = await new Promise((resolve, reject) => {
            db.db.all(`
                SELECT * FROM bulk_sms_operations 
                WHERE created_at >= ?
                ORDER BY created_at DESC 
                LIMIT ?
            `, [dateFrom, limit], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows || []);
                }
            });
        });

        // Get summary statistics
        const summary = bulkOperations.reduce((acc, op) => {
            acc.totalOperations += 1;
            acc.totalRecipients += op.total_recipients;
            acc.totalSuccessful += op.successful;
            acc.totalFailed += op.failed;
            return acc;
        }, {
            totalOperations: 0,
            totalRecipients: 0,
            totalSuccessful: 0,
            totalFailed: 0
        });

        summary.successRate = summary.totalRecipients > 0 ? 
            Math.round((summary.totalSuccessful / summary.totalRecipients) * 100) : 0;

        res.json({
            success: true,
            summary: summary,
            operations: bulkOperations,
            time_period_hours: hours
        });

    } catch (error) {
        console.error('❌ Error fetching bulk SMS status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch bulk SMS status',
            details: error.message
        });
    }
});

// SMS analytics dashboard endpoint
app.get('/api/sms/analytics', async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 7;
        const dateFrom = new Date(Date.now() - (days * 24 * 60 * 60 * 1000)).toISOString();

        const analytics = await new Promise((resolve, reject) => {
            const queries = {
                // Daily message volume
                dailyVolume: `
                    SELECT 
                        DATE(created_at) as date,
                        COUNT(*) as total,
                        COUNT(CASE WHEN direction = 'outbound' THEN 1 END) as sent,
                        COUNT(CASE WHEN direction = 'inbound' THEN 1 END) as received,
                        COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered,
                        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed
                    FROM sms_messages 
                    WHERE created_at >= ?
                    GROUP BY DATE(created_at) 
                    ORDER BY date DESC
                `,
                
                // Hourly distribution
                hourlyDistribution: `
                    SELECT 
                        strftime('%H', created_at) as hour,
                        COUNT(*) as count
                    FROM sms_messages 
                    WHERE created_at >= ?
                    GROUP BY strftime('%H', created_at)
                    ORDER BY hour
                `,
                
                // Top phone numbers (anonymized)
                topNumbers: `
                    SELECT 
                        SUBSTR(COALESCE(to_number, from_number), 1, 6) || 'XXXX' as phone_prefix,
                        COUNT(*) as message_count
                    FROM sms_messages 
                    WHERE created_at >= ?
                    GROUP BY SUBSTR(COALESCE(to_number, from_number), 1, 6)
                    ORDER BY message_count DESC 
                    LIMIT 10
                `,
                
                // Error analysis
                errorAnalysis: `
                    SELECT 
                        error_code,
                        error_message,
                        COUNT(*) as count
                    FROM sms_messages 
                    WHERE created_at >= ? AND error_code IS NOT NULL
                    GROUP BY error_code, error_message
                    ORDER BY count DESC
                    LIMIT 10
                `
            };

            const results = {};
            let completed = 0;
            const total = Object.keys(queries).length;

            for (const [key, query] of Object.entries(queries)) {
                db.db.all(query, [dateFrom], (err, rows) => {
                    if (err) {
                        console.error(`SMS analytics query error for ${key}:`, err);
                        results[key] = [];
                    } else {
                        results[key] = rows || [];
                    }
                    
                    completed++;
                    if (completed === total) {
                        resolve(results);
                    }
                });
            }
        });

        // Calculate summary metrics
        const summary = {
            total_messages: 0,
            total_sent: 0,
            total_received: 0,
            total_delivered: 0,
            total_failed: 0,
            delivery_rate: 0,
            error_rate: 0
        };

        analytics.dailyVolume.forEach(day => {
            summary.total_messages += day.total;
            summary.total_sent += day.sent;
            summary.total_received += day.received;
            summary.total_delivered += day.delivered;
            summary.total_failed += day.failed;
        });

        if (summary.total_sent > 0) {
            summary.delivery_rate = Math.round((summary.total_delivered / summary.total_sent) * 100);
            summary.error_rate = Math.round((summary.total_failed / summary.total_sent) * 100);
        }

        res.json({
            success: true,
            period: {
                days: days,
                from: dateFrom,
                to: new Date().toISOString()
            },
            summary: summary,
            daily_volume: analytics.dailyVolume,
            hourly_distribution: analytics.hourlyDistribution,
            top_numbers: analytics.topNumbers,
            error_analysis: analytics.errorAnalysis,
            enhanced_analytics: true
        });

    } catch (error) {
        console.error('❌ Error fetching SMS analytics:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch SMS analytics',
            details: error.message
        });
    }
});

// SMS search endpoint
app.get('/api/sms/search', async (req, res) => {
    try {
        const query = req.query.q;
        const limit = Math.min(parseInt(req.query.limit) || 20, 50);
        const direction = req.query.direction; // 'inbound', 'outbound', or null for all
        const status = req.query.status; // message status filter

        if (!query || query.length < 2) {
            return res.status(400).json({
                success: false,
                error: 'Search query must be at least 2 characters'
            });
        }

        let whereClause = `WHERE (body LIKE ? OR to_number LIKE ? OR from_number LIKE ?)`;
        let queryParams = [`%${query}%`, `%${query}%`, `%${query}%`];

        if (direction) {
            whereClause += ` AND direction = ?`;
            queryParams.push(direction);
        }

        if (status) {
            whereClause += ` AND status = ?`;
            queryParams.push(status);
        }

        queryParams.push(limit);

        const searchResults = await new Promise((resolve, reject) => {
            const searchQuery = `
                SELECT * FROM sms_messages 
                ${whereClause}
                ORDER BY created_at DESC
                LIMIT ?
            `;

            db.db.all(searchQuery, queryParams, (err, rows) => {
                if (err) {
                    console.error('SMS search query error:', err);
                    reject(err);
                } else {
                    resolve(rows || []);
                }
            });
        });

        // Format results for display
        const formattedResults = searchResults.map(msg => ({
            message_sid: msg.message_sid,
            phone: msg.to_number || msg.from_number,
            direction: msg.direction,
            status: msg.status,
            body: msg.body,
            created_at: msg.created_at,
            created_date: new Date(msg.created_at).toLocaleDateString(),
            created_time: new Date(msg.created_at).toLocaleTimeString(),
            // Highlight matching text (basic implementation)
            highlighted_body: msg.body.replace(
                new RegExp(query, 'gi'), 
                `**${query}**`
            ),
            error_info: msg.error_code ? {
                code: msg.error_code,
                message: msg.error_message
            } : null
        }));

        res.json({
            success: true,
            query: query,
            filters: { direction, status },
            results: formattedResults,
            result_count: formattedResults.length,
            enhanced_search: true
        });

    } catch (error) {
        console.error('❌ Error in SMS search:', error);
        res.status(500).json({
            success: false,
            error: 'Search failed',
            details: error.message
        });
    }
});

// Export SMS data endpoint
app.get('/api/sms/export', async (req, res) => {
    try {
        const format = req.query.format || 'json'; // 'json' or 'csv'
        const days = parseInt(req.query.days) || 30;
        const dateFrom = new Date(Date.now() - (days * 24 * 60 * 60 * 1000)).toISOString();

        const messages = await new Promise((resolve, reject) => {
            db.db.all(`
                SELECT 
                    message_sid,
                    to_number,
                    from_number,
                    body,
                    status,
                    direction,
                    created_at,
                    updated_at,
                    error_code,
                    error_message,
                    ai_response
                FROM sms_messages 
                WHERE created_at >= ?
                ORDER BY created_at DESC
            `, [dateFrom], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows || []);
                }
            });
        });

        if (format === 'csv') {
            // Generate CSV
            const csvHeaders = [
                'Message SID', 'To Number', 'From Number', 'Message Body', 
                'Status', 'Direction', 'Created At', 'Updated At', 
                'Error Code', 'Error Message', 'AI Response'
            ];

            let csvContent = csvHeaders.join(',') + '\n';
            
            messages.forEach(msg => {
                const row = [
                    msg.message_sid || '',
                    msg.to_number || '',
                    msg.from_number || '',
                    `"${(msg.body || '').replace(/"/g, '""')}"`, // Escape quotes
                    msg.status || '',
                    msg.direction || '',
                    msg.created_at || '',
                    msg.updated_at || '',
                    msg.error_code || '',
                    `"${(msg.error_message || '').replace(/"/g, '""')}"`,
                    `"${(msg.ai_response || '').replace(/"/g, '""')}"`
                ];
                csvContent += row.join(',') + '\n';
            });

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="sms-export-${new Date().toISOString().split('T')[0]}.csv"`);
            res.send(csvContent);

        } else {
            // Return JSON
            res.json({
                success: true,
                export_info: {
                    total_messages: messages.length,
                    date_range: {
                        from: dateFrom,
                        to: new Date().toISOString()
                    },
                    exported_at: new Date().toISOString()
                },
                messages: messages
            });
        }

    } catch (error) {
        console.error('❌ Error exporting SMS data:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to export SMS data',
            details: error.message
        });
    }
});

// SMS system health check
app.get('/api/sms/health', async (req, res) => {
    try {
        const health = {
            timestamp: new Date().toISOString(),
            status: 'healthy',
            services: {
                database: { status: 'unknown' },
                twilio: { status: 'unknown' },
                sms_service: { status: 'unknown' }
            },
            statistics: {
                active_conversations: 0,
                scheduled_messages: 0,
                recent_messages: 0
            }
        };

        // Check database connectivity
        try {
            const dbTest = await new Promise((resolve, reject) => {
                db.db.get('SELECT COUNT(*) as count FROM sms_messages LIMIT 1', (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });
            
            health.services.database.status = 'healthy';
            health.services.database.message_count = dbTest.count;
        } catch (dbError) {
            health.services.database.status = 'unhealthy';
            health.services.database.error = dbError.message;
            health.status = 'degraded';
        }

        // Check SMS service if available
        try {
            if (smsService) {
                const stats = smsService.getStatistics();
                health.services.sms_service.status = 'healthy';
                health.statistics.active_conversations = stats.active_conversations;
                health.statistics.scheduled_messages = stats.scheduled_messages;
            } else {
                health.services.sms_service.status = 'not_initialized';
            }
        } catch (smsError) {
            health.services.sms_service.status = 'unhealthy';
            health.services.sms_service.error = smsError.message;
        }

        // Check recent activity
        try {
            const recentCount = await new Promise((resolve, reject) => {
                const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
                db.db.get(
                    'SELECT COUNT(*) as count FROM sms_messages WHERE created_at >= ?',
                    [oneHourAgo],
                    (err, row) => {
                        if (err) reject(err);
                        else resolve(row.count || 0);
                    }
                );
            });
            
            health.statistics.recent_messages = recentCount;
        } catch (recentError) {
            console.warn('Could not get recent message count:', recentError);
        }

        // Check Twilio connectivity (basic check)
        try {
            if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
                health.services.twilio.status = 'configured';
                health.services.twilio.account_sid = process.env.TWILIO_ACCOUNT_SID.substring(0, 8) + '...';
            } else {
                health.services.twilio.status = 'not_configured';
                health.status = 'degraded';
            }
        } catch (twilioError) {
            health.services.twilio.status = 'error';
            health.services.twilio.error = twilioError.message;
        }

        res.json(health);

    } catch (error) {
        console.error('❌ SMS health check error:', error);
        res.status(500).json({
            timestamp: new Date().toISOString(),
            status: 'unhealthy',
            error: 'Health check failed',
            details: error.message
        });
    }
});

// Clean up old SMS conversations (manual trigger)
app.post('/api/sms/cleanup-conversations', async (req, res) => {
    try {
        if (!smsService) {
            return res.status(500).json({
                success: false,
                error: 'SMS service not initialized'
            });
        }

        const maxAgeHours = parseInt(req.body.max_age_hours) || 24;
        const cleaned = smsService.cleanupOldConversations(maxAgeHours);

        res.json({
            success: true,
            cleaned_count: cleaned,
            max_age_hours: maxAgeHours,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Error cleaning up SMS conversations:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to cleanup conversations',
            details: error.message
        });
    }
});

// Start scheduled message processor
setInterval(() => {
    smsService.processScheduledMessages().catch(error => {
        console.error('❌ Scheduled SMS processing error:', error);
    });
}, 60000); // Check every minute

// Cleanup old conversations every hour
setInterval(() => {
    smsService.cleanupOldConversations(24); // Keep conversations for 24 hours
}, 60 * 60 * 1000);

startServer();

// Enhanced graceful shutdown with comprehensive cleanup
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down enhanced adaptive system gracefully...'.yellow);
  
  try {
    // Log shutdown start
    await db.logServiceHealth('system', 'shutdown_initiated', {
      active_calls: callConfigurations.size,
      tracked_calls: callFunctionSystems.size
    });
    
    // Stop services
    webhookService.stop();
    callConfigurations.clear();
    callFunctionSystems.clear();
    
    // Log successful shutdown
    await db.logServiceHealth('system', 'shutdown_completed', {
      timestamp: new Date().toISOString()
    });
    
    await db.close();
    console.log('✅ Enhanced adaptive system shutdown complete'.green);
  } catch (shutdownError) {
    console.error('❌ Error during shutdown:', shutdownError);
  }
  
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down enhanced adaptive system gracefully...'.yellow);
  
  try {
    // Log shutdown start
    await db.logServiceHealth('system', 'shutdown_initiated', {
      active_calls: callConfigurations.size,
      tracked_calls: callFunctionSystems.size,
      reason: 'SIGTERM'
    });
    
    // Stop services
    webhookService.stop();
    callConfigurations.clear();
    callFunctionSystems.clear();
    
    // Log successful shutdown
    await db.logServiceHealth('system', 'shutdown_completed', {
      timestamp: new Date().toISOString()
    });
    
    await db.close();
    console.log('✅ Enhanced adaptive system shutdown complete'.green);
  } catch (shutdownError) {
    console.error('❌ Error during shutdown:', shutdownError);
  }
  
  process.exit(0);
});
