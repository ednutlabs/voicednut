require('dotenv').config();
require('colors');

const express = require('express');
const ExpressWs = require('express-ws');

const { GptService } = require('./services/gpt-service');
const { StreamService } = require('./services/stream-service');
const { TranscriptionService } = require('./services/transcription-service');
const { TextToSpeechService } = require('./services/tts-service');
const { recordingService } = require('./services/recording-service');

const VoiceResponse = require('twilio').twiml.VoiceResponse;

const app = express();
ExpressWs(app);

// Add JSON parsing middleware
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Store call configurations for dynamic agent setup
const callConfigurations = new Map();

app.post('/incoming', (req, res) => {
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

// New outbound call endpoint
app.post('/outbound-call', async (req, res) => {
  try {
    const { number, prompt, first_message } = req.body;

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
    callConfigurations.set(call.sid, {
      prompt: prompt,
      first_message: first_message,
      created_at: new Date().toISOString()
    });

    console.log(`Outbound call created: ${call.sid} to ${number}`.green);

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

// Enhanced WebSocket connection handler
app.ws('/connection', (ws) => {
  try {
    ws.on('error', console.error);
    // Filled in from start message
    let streamSid;
    let callSid;
    let callConfig = null;

    let gptService;
    const streamService = new StreamService(ws);
    const transcriptionService = new TranscriptionService();
    const ttsService = new TextToSpeechService({});
  
    let marks = [];
    let interactionCount = 0;
  
    // Incoming from MediaStream
    ws.on('message', function message(data) {
      const msg = JSON.parse(data);
      if (msg.event === 'start') {
        streamSid = msg.start.streamSid;
        callSid = msg.start.callSid;
        
        streamService.setStreamSid(streamSid);

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

        // Set RECORDING_ENABLED='true' in .env to record calls
        recordingService(ttsService, callSid).then(() => {
          console.log(`Twilio -> Starting Media Stream for ${streamSid}`.underline.red);
          
          // Use custom first message if available, otherwise use default
          const firstMessage = callConfig ? 
            callConfig.first_message : 
            'Hello! I understand you\'re looking for a pair of AirPods, is that correct?';
          
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
        // Clean up call configuration when call ends
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
      gptService.completion(text, interactionCount);
      interactionCount += 1;
    });
    
    // GPT service event handler (will be set up after gptService is initialized)
    const handleGptReply = async (gptReply, icount) => {
      console.log(`Interaction ${icount}: GPT -> TTS: ${gptReply.partialResponse}`.green );
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

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    active_calls: callConfigurations.size
  });
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

app.listen(PORT);
console.log(`Api server running on port ${PORT}`);
// console.log(`Outbound call endpoint available at: POST /outbound-call`);
