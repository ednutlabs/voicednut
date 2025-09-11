const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();
const app = express();

// CORS configuration for Telegram Mini Apps
const corsOrigins = process.env.CORS_ORIGINS ? 
    process.env.CORS_ORIGINS.split(',') : 
    ['https://web.telegram.org', 'https://t.me', 'http://localhost:3000'];

// Add all Telegram domains
corsOrigins.push(
    'https://*.web.telegram.org',
    'https://web.telegram.org',
    'https://t.me'
);

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        
        // Check if the origin matches any allowed pattern
        const isAllowed = corsOrigins.some(allowed => {
            if (allowed.includes('*')) {
                const pattern = new RegExp('^' + allowed.replace('*', '.*') + '$');
                return pattern.test(origin);
            }
            return allowed === origin;
        });
        
        if (isAllowed) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS']
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Health check - must be at root for Vercel
app.get('/', (req, res) => {
    res.json({ 
        status: 'healthy', 
        service: 'voicednut',
        timestamp: new Date().toISOString(),
        message: 'Mini App Server Running on Vercel'
    });
});

// Serve the Mini App HTML
app.get('/miniapp.html', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/miniapp.html'));
});

// API endpoint to validate Mini App data
app.post('/api/validate-webapp-data', (req, res) => {
    try {
        const { initData } = req.body;
        
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

// API endpoint for user data
app.get('/api/user/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        
        // For Vercel deployment, you might need to connect to external database
        // const user = await getUserFromDatabase(userId);
        
        // Placeholder response for now
        res.json({
            id: userId,
            username: 'demo_user',
            role: 'USER',
            isAdmin: false,
            joinDate: new Date().toISOString()
        });
    } catch (error) {
        console.error('User data error:', error);
        res.status(500).json({ error: 'Failed to get user data' });
    }
});

// API endpoint for user statistics
app.get('/api/user-stats/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        
        const stats = {
            total_calls: Math.floor(Math.random() * 50),
            total_sms: Math.floor(Math.random() * 100),
            this_month_calls: Math.floor(Math.random() * 10),
            this_month_sms: Math.floor(Math.random() * 20),
            recent_activity: []
        };
        
        res.json(stats);
    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({ error: 'Failed to get stats' });
    }
});

// Proxy calls to your main API
app.post('/api/outbound-call', async (req, res) => {
    try {
        // Validate required fields
        const { phone, prompt, first_message, initData } = req.body;
        if (!phone || !prompt || !first_message || !initData) {
            return res.status(400).json({ 
                error: 'Missing required fields',
                details: 'Phone, prompt, first_message and initData are required'
            });
        }

        // Validate phone format
        const e164Regex = /^\+[1-9]\d{1,14}$/;
        if (!e164Regex.test(phone.trim())) {
            return res.status(400).json({ 
                error: 'Invalid phone number format',
                details: 'Phone number must be in E.164 format (e.g., +1234567890)'
            });
        }

        // Validate Telegram Web App data
        if (!validateTelegramWebAppData(initData)) {
            return res.status(401).json({ 
                error: 'Invalid authentication',
                details: 'WebApp data validation failed'
            });
        }

        const axios = require('axios');
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

        res.json({
            success: true,
            call_sid: response.data.call_sid,
            status: response.data.status,
            to: phone
        });
    } catch (error) {
        console.error('Call proxy error:', error);
        res.status(error.response?.status || 500).json({ 
            error: error.response?.data?.error || error.message,
            details: error.response?.data?.details || 'An unexpected error occurred'
        });
    }
});

// Proxy SMS requests
app.post('/api/send-sms', async (req, res) => {
    try {
        // Validate required fields
        const { phone, message, initData } = req.body;
        if (!phone || !message || !initData) {
            return res.status(400).json({ 
                error: 'Missing required fields',
                details: 'Phone, message and initData are required'
            });
        }

        // Validate phone format
        if (!phone.startsWith('+') || phone.length < 10) {
            return res.status(400).json({ 
                error: 'Invalid phone number format',
                details: 'Phone number must start with + and be at least 10 digits'
            });
        }

        // Validate message length
        if (message.length > 1600) {
            return res.status(400).json({ 
                error: 'Message too long',
                details: 'SMS message must be 1600 characters or less'
            });
        }

        // Validate Telegram Web App data
        if (!validateTelegramWebAppData(initData)) {
            return res.status(401).json({ 
                error: 'Invalid authentication',
                details: 'WebApp data validation failed'
            });
        }

        const axios = require('axios');
        const response = await axios.post(`${process.env.API_URL}/send-sms`, {
            to: phone,
            message: message
        }, {
            headers: { 
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });

        res.json({
            success: true,
            message_sid: response.data.message_sid,
            status: response.data.status,
            to: phone
        });
    } catch (error) {
        console.error('SMS proxy error:', error);
        res.status(error.response?.status || 500).json({ 
            error: error.response?.data?.error || error.message,
            details: error.response?.data?.details || 'An unexpected error occurred'
        });
    }
});

// Function to validate Telegram Mini App data
function validateTelegramWebAppData(initData) {
    try {
        const urlParams = new URLSearchParams(initData);
        const hash = urlParams.get('hash');
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
        
        return calculatedHash === hash;
    } catch (error) {
        console.error('Validation error:', error);
        return false;
    }
}

// Export for Vercel
module.exports = app;

// For local development
if (process.env.NODE_ENV !== 'production') {
    const port = process.env.PORT || 3000;
    app.listen(port, () => {
        console.log(`🚀 Mini App server running on port ${port}`);
    });
}