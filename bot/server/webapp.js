const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

const app = express();

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
app.use(express.static(path.join(__dirname, '../public')));

// Health check endpoint
app.get('/', (req, res) => {
    res.json({ 
        status: 'healthy', 
        service: 'voicednut-miniapp',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        message: 'Mini App Server Running on Vercel'
    });
});

// Serve the Mini App HTML
app.get('/miniapp.html', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/miniapp.html'));
});

// Debug endpoint to check environment
app.get('/debug', (req, res) => {
    res.json({
        env: process.env.NODE_ENV,
        hasApiUrl: !!process.env.API_URL,
        hasBotToken: !!process.env.BOT_TOKEN,
        timestamp: new Date().toISOString()
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

// Enhanced user data endpoint
app.get('/api/user/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        
        // Mock admin check - replace with real logic
        const adminIds = (process.env.ADMIN_USER_IDS || '').split(',');
        const isAdmin = adminIds.includes(userId.toString()) || userId === 'admin';
        
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
        
        res.json(user);
    } catch (error) {
        console.error('User data error:', error);
        res.status(500).json({ error: 'Failed to get user data' });
    }
});

// Enhanced user statistics endpoint
app.get('/api/user-stats/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        
        // Generate realistic mock stats
        const baseStats = {
            total_calls: Math.floor(Math.random() * 20) + 1,
            total_sms: Math.floor(Math.random() * 50) + 5,
            this_month_calls: Math.floor(Math.random() * 10) + 1,
            this_month_sms: Math.floor(Math.random() * 20) + 2,
            success_rate: Math.floor(Math.random() * 30) + 70, // 70-100%
            last_activity: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000).toISOString(),
            average_call_duration: Math.floor(Math.random() * 300) + 60 // 60-360 seconds
        };
        
        // For demo user, use fixed stats
        if (userId === 'demo') {
            baseStats.total_calls = 12;
            baseStats.total_sms = 34;
            baseStats.this_month_calls = 5;
            baseStats.this_month_sms = 18;
        }
        
        res.json(baseStats);
    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({ 
            error: 'Failed to get stats',
            total_calls: 0,
            total_sms: 0
        });
    }
});

// Recent activity endpoint
app.get('/api/user-activity/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        const limit = parseInt(req.query.limit) || 10;
        
        // Mock recent activity data
        const activities = [];
        const now = new Date();
        
        for (let i = 0; i < limit; i++) {
            const isCall = Math.random() > 0.4;
            const hoursAgo = Math.random() * 24 * 7; // Within last week
            const timestamp = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000);
            
            activities.push({
                id: `${isCall ? 'call' : 'sms'}_${Date.now()}_${i}`,
                type: isCall ? 'call' : 'sms',
                phone_number: `+1${Math.floor(Math.random() * 9000000000) + 1000000000}`,
                status: isCall ? ['completed', 'failed', 'busy'][Math.floor(Math.random() * 3)] : 'delivered',
                duration: isCall ? Math.floor(Math.random() * 300) + 30 : null,
                message: isCall ? null : 'Sample SMS message...',
                created_at: timestamp.toISOString(),
                cost: (Math.random() * 0.5 + 0.1).toFixed(3)
            });
        }
        
        res.json({ activities, total: activities.length });
    } catch (error) {
        console.error('Activity error:', error);
        res.status(500).json({ error: 'Failed to get activity', activities: [] });
    }
});

// Enhanced outbound call proxy
app.post('/api/outbound-call', async (req, res) => {
    try {
        const { phone, prompt, first_message, initData } = req.body;
        
        console.log('Call request received:', { phone, prompt: prompt?.length, first_message: first_message?.length });
        
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

        // Validate prompt and message length
        if (prompt.length < 10 || first_message.length < 5) {
            return res.status(400).json({
                success: false,
                error: 'Content too short',
                details: 'Prompt must be at least 10 characters, first message at least 5 characters'
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
                message: 'Call simulated successfully (no external API configured)'
            });
        }

        // Make actual API call
        const axios = require('axios');
        console.log('Making API call to:', process.env.API_URL);
        
        const response = await axios.post(`${process.env.API_URL}/outbound-call`, {
            number: phone,
            prompt: prompt,
            first_message: first_message
        }, {
            headers: { 
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });

        console.log('API response:', response.data);

        res.json({
            success: true,
            call_sid: response.data.call_sid,
            status: response.data.status,
            to: phone,
            estimated_cost: response.data.estimated_cost || '$0.10'
        });
        
    } catch (error) {
        console.error('Call proxy error:', error);
        
        const statusCode = error.response?.status || 500;
        const errorMessage = error.response?.data?.error || error.message || 'Call failed';
        const errorDetails = error.response?.data?.details || 'An unexpected error occurred';
        
        res.status(statusCode).json({ 
            success: false,
            error: errorMessage,
            details: errorDetails,
            code: error.code || 'UNKNOWN_ERROR'
        });
    }
});

// Enhanced SMS proxy
app.post('/api/send-sms', async (req, res) => {
    try {
        const { phone, message, initData } = req.body;
        
        console.log('SMS request received:', { phone, messageLength: message?.length });
        
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
                message: 'SMS simulated successfully (no external API configured)'
            });
        }

        // Make actual API call
        const axios = require('axios');
        console.log('Making SMS API call to:', process.env.API_URL);
        
        const response = await axios.post(`${process.env.API_URL}/send-sms`, {
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
            status: response.data.status,
            to: phone,
            segments: response.data.segments || Math.ceil(message.length / 160),
            estimated_cost: response.data.estimated_cost || '$0.05'
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
            code: error.code || 'UNKNOWN_ERROR'
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
        details: process.env.NODE_ENV === 'development' ? error.message : 'An unexpected error occurred'
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        details: `${req.method} ${req.path} is not a valid endpoint`
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
    });
}