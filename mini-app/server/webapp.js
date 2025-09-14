const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const http = require('http');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Enhanced CORS configuration for Telegram Mini Apps
const corsOrigins = [
    'https://web.telegram.org',
    'https://t.me',
    /https:\/\/.*\.web\.telegram\.org/,
    'http://localhost:3000',
    'http://localhost:8080'
];

// Add environment-specific origins
if (process.env.CORS_ORIGINS) {
    corsOrigins.push(...process.env.CORS_ORIGINS.split(','));
}

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps)
        if (!origin) return callback(null, true);
        
        const isAllowed = corsOrigins.some(allowed => {
            if (allowed instanceof RegExp) {
                return allowed.test(origin);
            }
            if (typeof allowed === 'string' && allowed.includes('*')) {
                const pattern = new RegExp('^' + allowed.replace('*', '.*') + '$');
                return pattern.test(origin);
            }
            return allowed === origin;
        });
        
        callback(null, isAllowed);
    },
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files (Mini App HTML and assets)
const publicPath = path.join(__dirname, '../public');
console.log('Serving static files from:', publicPath);
app.use(express.static(publicPath));

// Health check endpoint
app.get('/', (req, res) => {
    res.json({ 
        status: 'healthy', 
        service: 'voicednut-miniapp',
        timestamp: new Date().toISOString(),
        version: '2.0.0',
        message: 'Mini App Server Running on Vercel',
        env: {
            hasApiUrl: !!process.env.API_URL,
            hasBotToken: !!process.env.BOT_TOKEN,
            nodeEnv: process.env.NODE_ENV
        }
    });
});

// Serve the Mini App HTML
app.get('/miniapp.html', (req, res) => {
    const miniappPath = path.join(__dirname, '../public/miniapp.html');
    console.log('Serving miniapp.html from:', miniappPath);
    res.sendFile(miniappPath, (err) => {
        if (err) {
            console.error('Error serving miniapp.html:', err);
            res.status(404).send('Mini App not found');
        }
    });
});

// Debug endpoint to check environment
app.get('/debug', (req, res) => {
    res.json({
        env: process.env.NODE_ENV,
        hasApiUrl: !!process.env.API_URL,
        hasBotToken: !!process.env.BOT_TOKEN,
        timestamp: new Date().toISOString(),
        platform: process.platform,
        nodeVersion: process.version,
        staticPath: path.join(__dirname, '../public'),
        workingDirectory: process.cwd()
    });
});

// Validate Mini App data
app.post('/api/validate-webapp-data', (req, res) => {
    try {
        const { initData } = req.body;
        
        if (!initData || initData === 'demo') {
            // Allow demo mode for development
            return res.json({ valid: true, demo: true });
        }
        
        if (validateTelegramWebAppData(initData)) {
            res.json({ valid: true });
        } else {
            res.status(401).json({ valid: false, error: 'Invalid init data' });
        }
    } catch (error) {
        console.error('Validation error:', error);
        res.status(500).json({ valid: false, error: 'Validation failed' });
    }
});

// Enhanced user data endpoint with better error handling
app.get('/api/user/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        console.log('Getting user data for:', userId);
        
        // Get admin IDs from environment or default
        const adminIds = (process.env.ADMIN_USER_IDS || process.env.ADMIN_ID || '').split(',').filter(id => id);
        const isAdmin = adminIds.includes(userId.toString()) || userId === 'admin' || userId === 'demo';
        
        console.log('Admin check:', { userId, adminIds, isAdmin });
        
        const user = {
            id: userId,
            username: userId === 'demo' ? 'demo_user' : `user_${userId}`,
            first_name: userId === 'demo' ? 'Demo' : 'User',
            last_name: userId === 'demo' ? 'User' : userId.toString(),
            role: isAdmin ? 'ADMIN' : 'USER',
            isAdmin: isAdmin,
            joinDate: new Date().toISOString(),
            status: 'active'
        };
        
        console.log('Returning user data:', user);
        res.json(user);
    } catch (error) {
        console.error('User data error:', error);
        res.status(500).json({ 
            error: 'Failed to get user data',
            details: error.message 
        });
    }
});

// Enhanced user statistics endpoint with realistic mock data
app.get('/api/user-stats/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        console.log('Getting stats for user:', userId);
        
        // Try to get real stats from external API first
        if (process.env.API_URL && userId !== 'demo') {
            try {
                const axios = require('axios');
                const response = await axios.get(`${process.env.API_URL}/user-stats/${userId}`, {
                    timeout: 5000,
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
                
                if (response.data) {
                    console.log('Got real stats from API:', response.data);
                    return res.json(response.data);
                }
            } catch (apiError) {
                console.warn('Failed to get real stats from API:', apiError.message);
                // Continue to mock data
            }
        }
        
        // Generate realistic mock stats
        const seed = userId === 'demo' ? 12345 : parseInt(userId) || Math.random() * 10000;
        const random = (seed * 9301 + 49297) % 233280; // Simple seeded random
        
        const baseStats = {
            total_calls: userId === 'demo' ? 12 : Math.floor((random / 233280) * 20) + 1,
            total_sms: userId === 'demo' ? 34 : Math.floor((random / 233280) * 50) + 5,
            this_month_calls: userId === 'demo' ? 5 : Math.floor((random / 233280) * 10) + 1,
            this_month_sms: userId === 'demo' ? 18 : Math.floor((random / 233280) * 20) + 2,
            success_rate: Math.floor((random / 233280) * 30) + 70, // 70-100%
            last_activity: new Date(Date.now() - (random / 233280) * 24 * 60 * 60 * 1000).toISOString(),
            average_call_duration: Math.floor((random / 233280) * 300) + 60, // 60-360 seconds
            total_cost: ((random / 233280) * 50 + 5).toFixed(2),
            this_week_calls: Math.floor((random / 233280) * 7) + 1,
            this_week_sms: Math.floor((random / 233280) * 15) + 3
        };
        
        console.log('Returning mock stats:', baseStats);
        res.json(baseStats);
    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({ 
            error: 'Failed to get stats',
            total_calls: 0,
            total_sms: 0,
            details: error.message
        });
    }
});

// Recent activity endpoint with better mock data
app.get('/api/user-activity/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        const limit = parseInt(req.query.limit) || 10;
        
        console.log('Getting activity for user:', userId, 'limit:', limit);
        
        // Try to get real activity from external API first
        if (process.env.API_URL && userId !== 'demo') {
            try {
                const axios = require('axios');
                const response = await axios.get(`${process.env.API_URL}/api/calls/list?limit=${limit}&user_id=${userId}`, {
                    timeout: 5000,
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
                
                if (response.data && response.data.calls) {
                    console.log('Got real activity from API');
                    const formattedActivity = response.data.calls.map(call => ({
                        id: call.call_sid || `call_${Date.now()}_${Math.random()}`,
                        type: 'call',
                        phone_number: call.phone_number,
                        status: call.status,
                        duration: call.duration,
                        created_at: call.created_at,
                        cost: call.cost || '0.10'
                    }));
                    
                    return res.json({ activities: formattedActivity, total: formattedActivity.length });
                }
            } catch (apiError) {
                console.warn('Failed to get real activity from API:', apiError.message);
                // Continue to mock data
            }
        }
        
        // Generate realistic mock activity data
        const activities = [];
        const now = new Date();
        const seed = userId === 'demo' ? 54321 : parseInt(userId) || Math.random() * 10000;
        
        for (let i = 0; i < Math.min(limit, 15); i++) {
            const random = ((seed + i) * 9301 + 49297) % 233280;
            const isCall = (random / 233280) > 0.4;
            const hoursAgo = (random / 233280) * 24 * 7; // Within last week
            const timestamp = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000);
            
            // Generate realistic phone numbers
            const areaCode = 200 + Math.floor((random / 233280) * 800);
            const exchange = 100 + Math.floor(((random + i * 1000) / 233280) * 900);
            const number = 1000 + Math.floor(((random + i * 2000) / 233280) * 9000);
            const phoneNumber = `+1${areaCode}${exchange}${number}`;
            
            activities.push({
                id: `${isCall ? 'call' : 'sms'}_${timestamp.getTime()}_${i}`,
                type: isCall ? 'call' : 'sms',
                phone_number: phoneNumber,
                status: isCall ? 
                    ['completed', 'failed', 'busy', 'no-answer'][Math.floor((random / 233280) * 4)] : 
                    ['delivered', 'sent', 'failed'][Math.floor((random / 233280) * 3)],
                duration: isCall ? Math.floor((random / 233280) * 300) + 30 : null,
                message: isCall ? null : `Sample message ${i + 1}...`,
                created_at: timestamp.toISOString(),
                cost: ((random / 233280) * 0.5 + 0.05).toFixed(3)
            });
        }
        
        // Sort by date (newest first)
        activities.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        
        console.log('Returning mock activity:', activities.length, 'items');
        res.json({ activities, total: activities.length });
    } catch (error) {
        console.error('Activity error:', error);
        res.status(500).json({ 
            error: 'Failed to get activity', 
            activities: [],
            details: error.message 
        });
    }
});

// Enhanced outbound call proxy with better validation and error handling
app.post('/api/outbound-call', async (req, res) => {
    try {
        const { phone, prompt, first_message, initData } = req.body;
        
        console.log('Call request received:', { 
            phone, 
            promptLength: prompt?.length, 
            firstMessageLength: first_message?.length,
            hasInitData: !!initData
        });
        
        // Validate required fields
        if (!phone || !prompt || !first_message) {
            return res.status(400).json({ 
                success: false,
                error: 'Missing required fields',
                details: 'Phone, prompt, and first_message are required'
            });
        }

        // Validate phone format
        const e164Regex = /^\+[1-9]\d{1,14}$/;
        if (!e164Regex.test(phone.trim())) {
            return res.status(400).json({ 
                success: false,
                error: 'Invalid phone number format',
                details: 'Phone number must be in E.164 format (e.g., +1234567890)'
            });
        }

        // Validate content length
        if (prompt.length < 10 || first_message.length < 5) {
            return res.status(400).json({
                success: false,
                error: 'Content too short',
                details: 'Prompt must be at least 10 characters, first message at least 5 characters'
            });
        }

        // Validate content length (upper bounds)
        if (prompt.length > 2000 || first_message.length > 500) {
            return res.status(400).json({
                success: false,
                error: 'Content too long',
                details: 'Prompt must be under 2000 characters, first message under 500 characters'
            });
        }

        // Skip validation for demo mode
        if (initData && initData !== 'demo' && !validateTelegramWebAppData(initData)) {
            return res.status(401).json({ 
                success: false,
                error: 'Invalid authentication',
                details: 'WebApp data validation failed'
            });
        }

        // If no external API URL, simulate success
        if (!process.env.API_URL) {
            const mockCallSid = 'CA' + Math.random().toString(36).substr(2, 32);
            
            console.log('Simulating call (no API configured):', mockCallSid);
            
            return res.json({
                success: true,
                call_sid: mockCallSid,
                status: 'initiated',
                to: phone,
                estimated_cost: '$0.10',
                message: 'Call simulated successfully (no external API configured)',
                timestamp: new Date().toISOString()
            });
        }

        // Make actual API call
        const axios = require('axios');
        console.log('Making API call to:', process.env.API_URL);
        
        const apiPayload = {
            number: phone,
            prompt: prompt,
            first_message: first_message
        };
        
        
        const response = await axios.post(`${process.env.API_URL}/outbound-call`, apiPayload, {
            headers: { 
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });

        console.log('API response status:', response.status);
        console.log('API response data:', response.data);

        const responseData = {
            success: true,
            call_sid: response.data.call_sid,
            status: response.data.status || 'initiated',
            to: phone,
            estimated_cost: response.data.estimated_cost || '$0.10',
            timestamp: new Date().toISOString()
        };

        res.json(responseData);
        
    } catch (error) {
        console.error('Call proxy error:', error.message);
        console.error('Error details:', {
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: error.response?.data,
            code: error.code
        });
        
        const statusCode = error.response?.status || 500;
        const errorMessage = error.response?.data?.error || error.message || 'Call failed';
        const errorDetails = error.response?.data?.details || 'An unexpected error occurred';
        
        res.status(statusCode).json({ 
            success: false,
            error: errorMessage,
            details: errorDetails,
            code: error.code || 'UNKNOWN_ERROR',
            timestamp: new Date().toISOString()
        });
    }
});

// Enhanced SMS proxy with better validation
app.post('/api/send-sms', async (req, res) => {
    try {
        const { phone, message, initData } = req.body;
        
        console.log('SMS request received:', { 
            phone, 
            messageLength: message?.length,
            hasInitData: !!initData
        });
        
        // Validate required fields
        if (!phone || !message) {
            return res.status(400).json({ 
                success: false,
                error: 'Missing required fields',
                details: 'Phone and message are required'
            });
        }

        // Validate phone format
        if (!phone.startsWith('+') || phone.length < 10) {
            return res.status(400).json({ 
                success: false,
                error: 'Invalid phone number format',
                details: 'Phone number must start with + and be at least 10 digits'
            });
        }

        // Validate message length
        if (message.length > 1600) {
            return res.status(400).json({ 
                success: false,
                error: 'Message too long',
                details: 'SMS message must be 1600 characters or less'
            });
        }

        if (message.length < 1) {
            return res.status(400).json({
                success: false,
                error: 'Message too short',
                details: 'SMS message cannot be empty'
            });
        }

        // Skip validation for demo mode
        if (initData && initData !== 'demo' && !validateTelegramWebAppData(initData)) {
            return res.status(401).json({ 
                success: false,
                error: 'Invalid authentication',
                details: 'WebApp data validation failed'
            });
        }

        // If no external API URL, simulate success
        if (!process.env.API_URL) {
            const mockMessageSid = 'SM' + Math.random().toString(36).substr(2, 32);
            
            console.log('Simulating SMS (no API configured):', mockMessageSid);
            
            return res.json({
                success: true,
                message_sid: mockMessageSid,
                status: 'sent',
                to: phone,
                segments: Math.ceil(message.length / 160),
                estimated_cost: '$0.05',
                message: 'SMS simulated successfully (no external API configured)',
                timestamp: new Date().toISOString()
            });
        }

        // Make actual API call
        const axios = require('axios');
        console.log('Making SMS API call to:', process.env.API_URL);
        
        const response = await axios.post(`${process.env.API_URL}/api/sms/send`, {
            to: phone,
            message: message
        }, {
            headers: { 
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });

        console.log('SMS API response:', response.data);

        res.json({
            success: true,
            message_sid: response.data.message_sid,
            status: response.data.status || 'sent',
            to: phone,
            segments: response.data.segments || Math.ceil(message.length / 160),
            estimated_cost: response.data.estimated_cost || '$0.05',
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('SMS proxy error:', error);
        
        const statusCode = error.response?.status || 500;
        const errorMessage = error.response?.data?.error || error.message || 'SMS failed';
        const errorDetails = error.response?.data?.details || 'An unexpected error occurred';
        
        res.status(statusCode).json({ 
            success: false,
            error: errorMessage,
            details: errorDetails,
            code: error.code || 'UNKNOWN_ERROR',
            timestamp: new Date().toISOString()
        });
    }
});

// Telegram WebApp data validation function
function validateTelegramWebAppData(initData) {
    try {
        if (!process.env.BOT_TOKEN) {
            console.warn('BOT_TOKEN not set, skipping validation');
            return true; // Allow in development
        }
        
        const urlParams = new URLSearchParams(initData);
        const hash = urlParams.get('hash');
        
        if (!hash) {
            console.warn('No hash in initData');
            return false;
        }
        
        urlParams.delete('hash');
        
        const dataCheckString = Array.from(urlParams.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => `${key}=${value}`)
            .join('\n');
        
        const secretKey = crypto
            .createHmac('sha256', 'WebAppData')
            .update(process.env.BOT_TOKEN)
            .digest();
        
        const calculatedHash = crypto
            .createHmac('sha256', secretKey)
            .update(dataCheckString)
            .digest('hex');
        
        const isValid = calculatedHash === hash;
        
        if (!isValid) {
            console.warn('Hash validation failed');
        }
        
        return isValid;
    } catch (error) {
        console.error('Validation error:', error);
        return false;
    }
}

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? error.message : 'An unexpected error occurred',
        timestamp: new Date().toISOString()
    });
});

// 404 handler
app.use((req, res) => {
    console.log('404 - Route not found:', req.method, req.path);
    res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        details: `${req.method} ${req.path} is not a valid endpoint`,
        timestamp: new Date().toISOString()
    });
});

// Export for Vercel
module.exports = app;

// For local development
if (require.main === module) {
    const port = process.env.PORT || 3000;
    app.listen(port, () => {
        console.log(`🚀 Mini App server running on port ${port}`);
        console.log(`📱 Mini App URL: http://localhost:${port}/miniapp.html`);
        console.log(`🔧 Debug URL: http://localhost:${port}/debug`);
        console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log(`🔗 API URL: ${process.env.API_URL || 'Not configured'}`);
        console.log(`🤖 Bot Token: ${process.env.BOT_TOKEN ? 'Configured' : 'Not configured'}`);
    });
}