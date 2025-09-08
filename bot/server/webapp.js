const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');

const app = express();
const PORT = config.webAppPort || 8080;

// CORS configuration for Telegram Mini Apps
app.use(cors({
    origin: config.cors.origins,
    credentials: true
}));

app.use(express.json());
app.use(express.static('public')); // Serve static files

// Serve the Mini App HTML
app.get('/miniapp.html', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/miniapp.html'));
});

// API endpoint to validate Mini App data
app.post('/api/validate-webapp-data', (req, res) => {
    try {
        const { initData } = req.body;
        
        // Validate Telegram Mini App init data
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

// API endpoint for Mini App to get user data
app.get('/api/user/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        
        // Get user from database (you'll need to implement this)
        const { getUser, isAdmin } = require('../bot/db/db');
        
        const user = await new Promise(r => getUser(parseInt(userId), r));
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const adminStatus = await new Promise(r => isAdmin(parseInt(userId), r));
        
        res.json({
            id: user.telegram_id,
            username: user.username,
            role: user.role,
            isAdmin: adminStatus,
            joinDate: user.timestamp
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
        
        // Get user stats from your database
        // This is a placeholder - implement according to your database schema
        const stats = {
            total_calls: 0,
            total_sms: 0,
            this_month_calls: 0,
            this_month_sms: 0,
            recent_activity: []
        };
        
        res.json(stats);
    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({ error: 'Failed to get stats' });
    }
});

// API endpoint for recent activity
app.get('/api/user-activity/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        const limit = req.query.limit || 10;
        
        // Get recent activity from your database
        // This would combine calls and SMS data
        const activity = [];
        
        res.json({ activity });
    } catch (error) {
        console.error('Activity error:', error);
        res.status(500).json({ error: 'Failed to get activity' });
    }
});

// Function to validate Telegram Mini App data
function validateTelegramWebAppData(initData) {
    try {
        const urlParams = new URLSearchParams(initData);
        const hash = urlParams.get('hash');
        urlParams.delete('hash');
        
        // Sort parameters
        const dataCheckString = Array.from(urlParams.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => `${key}=${value}`)
            .join('\n');
        
        // Create secret key
        const secretKey = crypto
            .createHmac('sha256', 'WebAppData')
            .update(config.botToken)
            .digest();
        
        // Calculate hash
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

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        service: 'mini-app-server',
        timestamp: new Date().toISOString()
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Mini App server running on port ${PORT}`);
    console.log(`📱 Mini App URL: http://localhost:${PORT}/miniapp.html`);
});

module.exports = app;
