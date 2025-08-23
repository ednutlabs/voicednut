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

async function startServer() {
  try {
    console.log('🚀 Initializing Adaptive AI Call System...'.blue);

    // Initialize database first
    console.log('Initializing database...'.yellow);
    db = new Database();
    await db.initialize();
    console.log('✅ Database initialized successfully'.green);

    // Start webhook service after database is ready
    console.log('Starting webhook service...'.yellow);
    webhookService.start(db);
    console.log('✅ Webhook service started'.green);

    // Initialize function engine
    console.log('✅ Dynamic Function Engine ready'.green);

    // Start HTTP server
    app.listen(PORT, () => {
      console.log(`✅ Adaptive API server running on port ${PORT}`.green);
      console.log(`🎭 System ready - Personality Engine & Dynamic Functions active`.green);
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

          // Update database
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
              'Hello! I understand you\'re looking for a pair of AirPods, is that correct?';
            
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
              'Hello! I understand you\'re looking for a pair of AirPods, is that correct?';
            
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
        adaptationEffectiveness: conversationAnalysis.personalityChanges / Math.max(conversationAnalysis.totalInteractions / 10, 1), // Adaptations per 10 interactions
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
    
    // Send professional transcript to user with adaptation insights
    if (callDetails && callDetails.user_chat_id && transcripts.length > 0) {
      setTimeout(async () => {
        await webhookService.sendCallTranscript(callSid, callDetails.user_chat_id);
      }, 2000);
    }

    console.log(`✅ Adaptive call ${callSid} completed`.green);
    console.log(`📊 Duration: ${duration}s | Messages: ${transcripts.length} | Adaptations: ${adaptationAnalysis.personalityChanges || 0}`.cyan);
    if (adaptationAnalysis.finalPersonality) {
      console.log(`🎭 Final personality: ${adaptationAnalysis.finalPersonality}`.magenta);
    }

  } catch (error) {
    console.error('Error handling adaptive call end:', error);
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

  const summary = `Adaptive call completed with ${transcripts.length} messages over ${Math.round(duration/60)} minutes. ` +
    `User spoke ${userMessages.length} times, AI responded ${aiMessages.length} times.`;

  return { summary, analysis };
}

// Enhanced API endpoints with adaptation analytics

// Get call details with personality and function analytics
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
    
    res.json({
      call,
      transcripts,
      transcript_count: transcripts.length,
      adaptation_analytics: adaptationData,
      business_context: call.business_context ? JSON.parse(call.business_context) : null
    });
  } catch (error) {
    console.error('Error fetching adaptive call details:', error);
    res.status(500).json({ error: 'Failed to fetch call details' });
  }
});

// Get adaptation analytics dashboard data
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
      adaptation_triggers: {}
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
    console.error('Error fetching adaptation analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
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
      analysis: functionEngine.getBusinessAnalysis()
    });
  } catch (error) {
    console.error('Error generating functions:', error);
    res.status(500).json({ error: 'Failed to generate functions' });
  }
});

// Enhanced health endpoint with adaptation system status
app.get('/health', async (req, res) => {
  try {
    const calls = await db.getCallsWithTranscripts(1);
    const webhookHealth = await webhookService.healthCheck();
    const businessAnalysis = functionEngine.getBusinessAnalysis();
    
    res.json({ 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      active_calls: callConfigurations.size,
      database_connected: true,
      recent_calls: calls.length,
      webhook_service: webhookHealth,
      adaptation_engine: {
        available_templates: businessAnalysis.availableTemplates.length,
        active_function_systems: callFunctionSystems.size
      }
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

startServer();

// Graceful shutdown with cleanup
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down adaptive system gracefully...'.yellow);
  webhookService.stop();
  callConfigurations.clear();
  callFunctionSystems.clear();
  await db.close();
  console.log('✅ Adaptive system shutdown complete'.green);
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down adaptive system gracefully...'.yellow);
  webhookService.stop();
  callConfigurations.clear();
  callFunctionSystems.clear();
  await db.close();
  console.log('✅ Adaptive system shutdown complete'.green);
  process.exit(0);
});
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

// Outbound call endpoint with dynamic function generation
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

      // Send initial status update
      if (user_chat_id) {
        await webhookService.sendImmediateStatus(call.sid, 'initiated', user_chat_id);
      }

      console.log(`📞 Adaptive call created: ${call.sid} to ${number}`.green);
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
      function_types: functionSystem.functions.map(f => f.function.name)
    });

  } catch (error) {
    console.error('Error creating adaptive outbound call:', error);
    res.status(500).json({
      error: 'Failed to create outbound call',
      details: error.message
    });
  }
});

// Enhanced webhook endpoint for call status updates
app.post('/webhook/call-status', async (req, res) => {
  try {
    const { CallSid, CallStatus, Duration, From, To } = req.body;
    
    console.log(`📱 Webhook: Call ${CallSid} status: ${CallStatus}`.blue);
    
    // Update call status in database
    const call = await db.getCall(CallSid);
    if (call) {
      await db.updateCallStatus(CallSid, CallStatus.toLowerCase(), {
        duration: Duration ? parseInt(Duration) : null,
        twilio_status: CallStatus
      });

      // Send professional status update to user
      if (call.user_chat_id) {
        await webhookService.sendImmediateStatus(CallSid, CallStatus, call.user_chat_id);
      }
    }
    
    res.status(200).send('OK');
  } catch (error) {
    console.error('Error processing call status webhook:', error);
    res.status(500).send('Internal Server Error');
  }
});
