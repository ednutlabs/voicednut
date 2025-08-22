require('dotenv').config();
require('colors');

const express = require('express');
const ExpressWs = require('express-ws');

const { GptService } = require('./routes/gpt');
const { StreamService } = require('./routes/stream');
const { TranscriptionService } = require('./routes/transcription');
const { TextToSpeechService } = require('./routes/tts');
const { recordingService } = require('./routes/recording');
const Database = require('./db/db');
const { webhookService } = require('./routes/status');
const validateTwilioRequest = require('./middleware/twilioSignature');

const VoiceResponse = require('twilio').twiml.VoiceResponse;

const app = express();
ExpressWs(app);

// Add JSON parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;

// Initialize database and start services
let db;

async function startServer() {
  try {
    // Initialize database first
    console.log('Initializing database...'.yellow);
    db = new Database();
    await db.initialize();
    console.log('✅ Database initialized successfully'.green);

    // Start webhook service after database is ready
    console.log('Starting webhook service...'.yellow);
    webhookService.start(db);
    console.log('✅ Webhook service started'.green);

    // Start the server
    app.listen(PORT);
    console.log(`✅ API server running on port ${PORT}`.green);
    console.log(`✅ System ready - Database and webhooks active`.green);

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Store call configurations for dynamic agent setup
const callConfigurations = new Map();

// Store active call sessions for database updates
const activeCalls = new Map();

app.post('/incoming', validateTwilioRequest, (req, res) => {
  try {
    const response = new VoiceResponse();
    const connect = response.connect();
    connect.stream({ url: `wss://${process.env.SERVER}/connection` });
  
    res.type('text/xml');
    res.end(response.toString());
  } catch (err) {
    console.log(err);
  }
});

// Enhanced outbound call endpoint with database logging
app.post('/outbound-call', async (req, res) => {
  try {
    const { number, prompt, first_message, user_chat_id } = req.body;

    // Validate required fields
    if (!number || !prompt || !first_message) {
      return res.status(400).json({
        error: 'Missing required fields: number, prompt, and first_message are required'
      });
    }

    // Validate phone number format (basic validation)
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

    const client = require('twilio')(accountSid, authToken);

    // Create the outbound call
    const call = await client.calls.create({
      url: `https://${process.env.SERVER}/incoming`,
      to: number,
      from: process.env.FROM_NUMBER
    });

    // Store the configuration for this call
    const callConfig = {
      prompt: prompt,
      first_message: first_message,
      created_at: new Date().toISOString()
    };
    
    callConfigurations.set(call.sid, callConfig);

    // Save call to database
    try {
      await db.createCall({
        call_sid: call.sid,
        phone_number: number,
        prompt: prompt,
        first_message: first_message,
        user_chat_id: user_chat_id
      });

      // Create initial webhook notification if user_chat_id is provided
      if (user_chat_id) {
        await db.createWebhookNotification(call.sid, 'call_initiated', user_chat_id);
      }

      console.log(`Outbound call created and saved: ${call.sid} to ${number}`.green);
    } catch (dbError) {
      console.error('Database error:', dbError);
      // Continue with call even if database fails
    }

    res.json({
      success: true,
      call_sid: call.sid,
      to: number,
      status: call.status
    });

  } catch (error) {
    console.error('Error creating outbound call:', error);
    res.status(500).json({
      error: 'Failed to create outbound call',
      details: error.message
    });
  }
});

// Enhanced WebSocket connection handler with database integration
app.ws('/connection', (ws) => {
  try {
    ws.on('error', console.error);
    // Filled in from start message
    let streamSid;
    let callSid;
    let callConfig = null;
    let callStartTime = null;

    let gptService;
    const streamService = new StreamService(ws);
    const transcriptionService = new TranscriptionService();
    const ttsService = new TextToSpeechService({});
  
    let marks = [];
    let interactionCount = 0;
  
    // Incoming from MediaStream
    ws.on('message', async function message(data) {
      const msg = JSON.parse(data);
      if (msg.event === 'start') {
        streamSid = msg.start.streamSid;
        callSid = msg.start.callSid;
        callStartTime = new Date();
        
        streamService.setStreamSid(streamSid);

        // Update call status to 'started' in database
        try {
          await db.updateCallStatus(callSid, 'started', {
            started_at: callStartTime.toISOString()
          });
          await db.updateCallState(callSid, 'stream_started', {
            stream_sid: streamSid,
            start_time: callStartTime.toISOString()
          });
        } catch (dbError) {
          console.error('Database error on call start:', dbError);
        }

        // Check if this is a configured outbound call
        callConfig = callConfigurations.get(callSid);
        
        if (callConfig) {
          console.log(`Configured outbound call detected: ${callSid}`.green);
          // Initialize GPT service with custom prompt
          gptService = new GptService(callConfig.prompt, callConfig.first_message);
        } else {
          console.log(`Standard call detected: ${callSid}`.yellow);
          // Use default configuration for regular calls
          gptService = new GptService();
        }
        
        gptService.setCallSid(callSid);

        // Store active call session
        activeCalls.set(callSid, {
          startTime: callStartTime,
          transcripts: [],
          gptService,
          callConfig
        });

        // Set RECORDING_ENABLED='true' in .env to record calls
        recordingService(ttsService, callSid).then(async () => {
          console.log(`Twilio -> Starting Media Stream for ${streamSid}`.underline.red);
          
          // Use custom first message if available, otherwise use default
          const firstMessage = callConfig ? 
            callConfig.first_message : 
            'Hello! I understand you\'re looking for a pair of AirPods, is that correct?';
          
          // Log first AI message
          try {
            await db.addTranscript({
              call_sid: callSid,
              speaker: 'ai',
              message: firstMessage,
              interaction_count: 0
            });
          } catch (dbError) {
            console.error('Database error adding AI transcript:', dbError);
          }
          
          ttsService.generate({
            partialResponseIndex: null, 
            partialResponse: firstMessage
          }, 0);
        });

        // Clean up old call configurations (older than 1 hour)
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        for (const [sid, config] of callConfigurations.entries()) {
          if (new Date(config.created_at) < oneHourAgo) {
            callConfigurations.delete(sid);
          }
        }

      } else if (msg.event === 'media') {
        transcriptionService.send(msg.media.payload);
      } else if (msg.event === 'mark') {
        const label = msg.mark.name;
        console.log(`Twilio -> Audio completed mark (${msg.sequenceNumber}): ${label}`.red);
        marks = marks.filter(m => m !== msg.mark.name);
      } else if (msg.event === 'stop') {
        console.log(`Twilio -> Media stream ${streamSid} ended.`.underline.red);
        
        // Handle call end and generate summary
        await handleCallEnd(callSid, callStartTime);
        
        // Clean up
        activeCalls.delete(callSid);
        if (callSid && callConfigurations.has(callSid)) {
          callConfigurations.delete(callSid);
          console.log(`Cleaned up configuration for call: ${callSid}`.yellow);
        }
      }
    });
  
    transcriptionService.on('utterance', async (text) => {
      // This is a bit of a hack to filter out empty utterances
      if(marks.length > 0 && text?.length > 5) {
        console.log('Twilio -> Interruption, Clearing stream'.red);
        ws.send(
          JSON.stringify({
            streamSid,
            event: 'clear',
          })
        );
      }
    });
  
    transcriptionService.on('transcription', async (text) => {
      if (!text || !gptService) { return; }
      
      console.log(`Interaction ${interactionCount} – STT -> GPT: ${text}`.yellow);
      
      // Save user transcript to database
      try {
        await db.addTranscript({
          call_sid: callSid,
          speaker: 'user',
          message: text,
          interaction_count: interactionCount
        });
        
        // Update call state
        await db.updateCallState(callSid, 'user_spoke', {
          message: text,
          interaction_count: interactionCount
        });
      } catch (dbError) {
        console.error('Database error adding user transcript:', dbError);
      }
      
      gptService.completion(text, interactionCount);
      interactionCount += 1;
    });
    
    // GPT service event handler (will be set up after gptService is initialized)
    const handleGptReply = async (gptReply, icount) => {
      console.log(`Interaction ${icount}: GPT -> TTS: ${gptReply.partialResponse}`.green);
      
      // Save AI response to database
      try {
        await db.addTranscript({
          call_sid: callSid,
          speaker: 'ai',
          message: gptReply.partialResponse,
          interaction_count: icount
        });
        
        // Update call state
        await db.updateCallState(callSid, 'ai_responded', {
          message: gptReply.partialResponse,
          interaction_count: icount
        });
      } catch (dbError) {
        console.error('Database error adding AI transcript:', dbError);
      }
      
      ttsService.generate(gptReply, icount);
    };

    // Set up GPT reply handler when gptService becomes available
    const setupGptHandler = () => {
      if (gptService) {
        gptService.on('gptreply', handleGptReply);
        return true;
      }
      return false;
    };

    // Poll for gptService initialization
    const gptHandlerInterval = setInterval(() => {
      if (setupGptHandler()) {
        clearInterval(gptHandlerInterval);
      }
    }, 100);
  
    ttsService.on('speech', (responseIndex, audio, label, icount) => {
      console.log(`Interaction ${icount}: TTS -> TWILIO: ${label}`.blue);
      streamService.buffer(responseIndex, audio);
    });
  
    streamService.on('audiosent', (markLabel) => {
      marks.push(markLabel);
    });

    // Clean up interval on connection close
    ws.on('close', () => {
      if (gptHandlerInterval) {
        clearInterval(gptHandlerInterval);
      }
    });

  } catch (err) {
    console.log(err);
  }
});

// Function to handle call end and generate summary
async function handleCallEnd(callSid, callStartTime) {
  try {
    const callEndTime = new Date();
    const duration = Math.round((callEndTime - callStartTime) / 1000); // Duration in seconds

    // Get all transcripts for this call
    const transcripts = await db.getCallTranscripts(callSid);
    
    // Generate call summary
    const summary = generateCallSummary(transcripts, duration);
    
    // Update call status in database
    await db.updateCallStatus(callSid, 'completed', {
      ended_at: callEndTime.toISOString(),
      duration: duration,
      call_summary: summary.summary,
      ai_analysis: JSON.stringify(summary.analysis)
    });

    // Update call state
    await db.updateCallState(callSid, 'call_ended', {
      end_time: callEndTime.toISOString(),
      duration: duration,
      total_interactions: transcripts.length
    });

    // Get call details for webhook
    const callDetails = await db.getCall(callSid);
    
    // Create webhook notifications for call completion
    if (callDetails && callDetails.user_chat_id) {
      await db.createWebhookNotification(callSid, 'call_completed', callDetails.user_chat_id);
      await db.createWebhookNotification(callSid, 'call_summary', callDetails.user_chat_id);
    }

    console.log(`Call ${callSid} ended. Duration: ${duration}s, Transcripts: ${transcripts.length}`.green);

  } catch (error) {
    console.error('Error handling call end:', error);
  }
}

// Function to generate call summary
function generateCallSummary(transcripts, duration) {
  if (!transcripts || transcripts.length === 0) {
    return {
      summary: 'No conversation recorded',
      analysis: { total_messages: 0, user_messages: 0, ai_messages: 0 }
    };
  }

  const userMessages = transcripts.filter(t => t.speaker === 'user');
  const aiMessages = transcripts.filter(t => t.speaker === 'ai');
  
  // Basic analysis
  const analysis = {
    total_messages: transcripts.length,
    user_messages: userMessages.length,
    ai_messages: aiMessages.length,
    duration_seconds: duration,
    conversation_turns: Math.max(userMessages.length, aiMessages.length)
  };

  // Generate simple summary
  const summary = `Call completed with ${transcripts.length} messages over ${Math.round(duration/60)} minutes. ` +
    `User spoke ${userMessages.length} times, AI responded ${aiMessages.length} times.`;

  return { summary, analysis };
}

// API Endpoints for database access

// Get call details with transcripts
app.get('/api/calls/:callSid', async (req, res) => {
  try {
    const { callSid } = req.params;
    
    const call = await db.getCall(callSid);
    if (!call) {
      return res.status(404).json({ error: 'Call not found' });
    }

    const transcripts = await db.getCallTranscripts(callSid);
    
    res.json({
      call,
      transcripts,
      transcript_count: transcripts.length
    });
  } catch (error) {
    console.error('Error fetching call details:', error);
    res.status(500).json({ error: 'Failed to fetch call details' });
  }
});

// Get all calls with summary
app.get('/api/calls', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const calls = await db.getCallsWithTranscripts(limit);
    
    res.json({
      calls,
      count: calls.length
    });
  } catch (error) {
    console.error('Error fetching calls:', error);
    res.status(500).json({ error: 'Failed to fetch calls' });
  }
});

// Webhook endpoint for external notifications
app.post('/webhook/call-status', async (req, res) => {
  try {
    const { CallSid, CallStatus, Duration } = req.body;
    
    console.log(`Webhook: Call ${CallSid} status: ${CallStatus}`.blue);
    
    // Update call status if it exists in our database
    const call = await db.getCall(CallSid);
    if (call) {
      await db.updateCallStatus(CallSid, CallStatus.toLowerCase(), {
        duration: Duration ? parseInt(Duration) : null
      });
    }
    
    res.status(200).send('OK');
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).send('Error');
  }
});

// Health check endpoint (enhanced)
app.get('/health', async (req, res) => {
  try {
    const calls = await db.getCallsWithTranscripts(1);
    res.json({ 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      active_calls: callConfigurations.size,
      database_connected: true,
      recent_calls: calls.length
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      database_connected: false,
      error: error.message
    });
  }
});

// Get call configuration (for debugging)
app.get('/call-config/:callSid', (req, res) => {
  const { callSid } = req.params;
  const config = callConfigurations.get(callSid);
  
  if (config) {
    res.json({
      call_sid: callSid,
      config: {
        ...config,
        // Don't expose the full prompt for security
        prompt_preview: config.prompt.substring(0, 100) + '...',
        first_message: config.first_message
      }
    });
  } else {
    res.status(404).json({ error: 'Call configuration not found' });
  }
});

// Start webhook service
// Removed from here - now started in startServer() function after database init

// Start the server with proper initialization sequence
startServer();

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...');
  await db.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nShutting down gracefully...');
  await db.close();
  process.exit(0);
});