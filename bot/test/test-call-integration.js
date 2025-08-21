// Simple integration test for callFlow
// Starts a mock API that returns a call_sid and runs callFlow with a fake conversation/ctx

const http = require('http');
const { callFlow } = require('../commands/call');
const config = require('../config');

// Start mock API server
const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/outbound-call') {
    let body = '';
    req.on('data', (chunk) => body += chunk);
    req.on('end', () => {
      console.log('Mock API received:', body);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true, call_sid: 'MOCK_CALL_SID_12345' }));
    });
    return;
  }
  res.statusCode = 404;
  res.end();
});

server.listen(3005, async () => {
  console.log('Mock API listening on http://localhost:3005');

  // Temporary override config.apiUrl
  const originalApiUrl = config.apiUrl;
  config.apiUrl = 'http://localhost:3005';

  // Fake conversation that yields messages sequentially
  const messages = [
    { message: { text: '+15551234567' } },
    { message: { text: 'You are a helpful sales agent.' } },
    { message: { text: 'Hello, I am calling about your recent order.' } }
  ];

  let msgIndex = 0;
  const conversation = {
    wait: async () => {
      const msg = messages[msgIndex++];
      // simulate small delay
      await new Promise(r => setTimeout(r, 50));
      return msg;
    }
  };

  // Fake ctx that captures replies
  const ctx = {
    from: { id: 9999 },
    reply: async (text, opts) => {
      console.log('BOT REPLY:', text, opts || '');
    }
  };

  try {
    await callFlow(conversation, ctx);
    console.log('callFlow completed');
  } catch (err) {
    console.error('callFlow error:', err);
  } finally {
    config.apiUrl = originalApiUrl;
    server.close();
  }
});
