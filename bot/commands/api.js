const config = require('../config');
const axios = require('axios');
const { getUser, isAdmin } = require('../db/db');

module.exports = (bot) => {
    // API test command (enhanced)
    bot.command('testapi', async (ctx) => {
        try {
            // Check if user is authorized and is admin
            const user = await new Promise(r => getUser(ctx.from.id, r));
            if (!user) {
                return ctx.reply('❌ You are not authorized to use this bot.');
            }

            const adminStatus = await new Promise(r => isAdmin(ctx.from.id, r));
            if (!adminStatus) {
                return ctx.reply('❌ This command is for administrators only.');
            }

            await ctx.reply('🧪 Testing API connection...');

            console.log('Testing API connection to:', config.apiUrl);
            const startTime = Date.now();
            const response = await axios.get(`${config.apiUrl}/health`, {
                timeout: 10000,
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });
            const responseTime = Date.now() - startTime;
            
            const health = response.data;
            console.log('API Health Response:', health);
            
            let message = `✅ *API Status: ${health.status || 'healthy'}*\n\n`;
            message += `🔗 URL: ${config.apiUrl}\n`;
            message += `⚡ Response Time: ${responseTime}ms\n`;
            message += `📊 Active Calls: ${health.active_calls || 0}\n`;
            
            // Handle different response structures
            if (health.services) {
                const db = health.services.database;
                const webhook = health.services.webhook_service;
                
                message += `🗄️ Database: ${db?.connected ? '✅ Connected' : '❌ Disconnected'}\n`;
                message += `📋 Recent Calls: ${db?.recent_calls || 0}\n`;
                message += `📡 Webhook Service: ${webhook?.status || 'Unknown'}\n`;
                
                if (health.adaptation_engine) {
                    message += `🤖 Adaptation Engine: ✅ Active\n`;
                    message += `🧩 Function Templates: ${health.adaptation_engine.available_templates || 0}\n`;
                }
            } else {
                // Fallback for simpler health responses
                message += `🗄️ Database: ${health.database_connected ? '✅ Connected' : '❌ Unknown'}\n`;
            }
            
            message += `⏰ Timestamp: ${new Date(health.timestamp).toLocaleString()}\n`;
            
            // Add enhanced features info if available
            if (health.enhanced_features) {
                message += `\n🚀 Enhanced Features: ✅ Active`;
            }
            
            await ctx.reply(message, { parse_mode: 'Markdown' });
        } catch (error) {
            console.error('API test failed:', error);
            
            let errorMessage = `❌ *API Test Failed*\n\nURL: ${config.apiUrl}\n`;
            
            if (error.response) {
                errorMessage += `Status: ${error.response.status} - ${error.response.statusText}\n`;
                errorMessage += `Error: ${error.response.data?.error || error.message}`;
            } else if (error.code === 'ECONNREFUSED') {
                errorMessage += `Error: Connection refused - API server may be down`;
            } else if (error.code === 'ENOTFOUND') {
                errorMessage += `Error: Host not found - Check API URL`;
            } else if (error.code === 'ETIMEDOUT') {
                errorMessage += `Error: Request timeout - API server is not responding`;
            } else {
                errorMessage += `Error: ${error.message}`;
            }
            
            await ctx.reply(errorMessage, { parse_mode: 'Markdown' });
        }
    });

    // Status command (admin only) - Enhanced version
    bot.command('status', async (ctx) => {
        try {
            // Check if user is admin
            const user = await new Promise(r => getUser(ctx.from.id, r));
            const adminStatus = await new Promise(r => isAdmin(ctx.from.id, r));
            
            if (!user || !adminStatus) {
                return ctx.reply('❌ This command is for administrators only.');
            }

            await ctx.reply('🔍 Checking system status...');

            const startTime = Date.now();
            const response = await axios.get(`${config.apiUrl}/health`, {
                timeout: 15000,
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });
            const responseTime = Date.now() - startTime;
            
            const health = response.data;
            
            let message = `🔍 *System Status Report*\n\n`;
            message += `🤖 Bot: ✅ Online & Responsive\n`;
            message += `🌐 API: ${health.status === 'healthy' ? '✅' : '❌'} ${health.status || 'healthy'}\n`;
            message += `⚡ API Response Time: ${responseTime}ms\n\n`;
            
            // Enhanced service status
            if (health.services) {
                message += `*🔧 Services Status:*\n`;
                
                const db = health.services.database;
                message += `🗄️ Database: ${db?.connected ? '✅ Connected' : '❌ Disconnected'}\n`;
                if (db?.recent_calls !== undefined) {
                    message += `📋 Recent DB Calls: ${db.recent_calls}\n`;
                }
                
                const webhook = health.services.webhook_service;
                if (webhook) {
                    message += `📡 Webhook Service: ${webhook.status === 'running' ? '✅' : '⚠️'} ${webhook.status}\n`;
                    if (webhook.processed_today !== undefined) {
                        message += `📨 Webhooks Today: ${webhook.processed_today}\n`;
                    }
                }
                
                const notifications = health.services.notification_system;
                if (notifications) {
                    message += `🔔 Notifications: ${notifications.success_rate || 'N/A'} success rate\n`;
                }
                
                message += `\n`;
            }
            
            // Call statistics
            message += `*📊 Call Statistics:*\n`;
            message += `📞 Active Calls: ${health.active_calls || 0}\n`;
            
            // Enhanced features
            if (health.adaptation_engine) {
                message += `\n*🤖 AI Features:*\n`;
                message += `🧠 Adaptation Engine: ✅ Active\n`;
                message += `🧩 Function Templates: ${health.adaptation_engine.available_templates || 0}\n`;
                message += `⚙️ Active Systems: ${health.adaptation_engine.active_function_systems || 0}\n`;
            }
            
            if (health.enhanced_features) {
                message += `🚀 Enhanced Features: ✅ Enabled\n`;
            }
            
            // System health logs (if available)
            if (health.system_health && health.system_health.length > 0) {
                message += `\n*🔍 Recent Activity:*\n`;
                health.system_health.slice(0, 3).forEach(log => {
                    const status = log.status === 'error' ? '❌' : '✅';
                    message += `${status} ${log.service_name}: ${log.count} ${log.status}\n`;
                });
            }
            
            message += `\n⏰ Last Updated: ${new Date(health.timestamp).toLocaleString()}`;
            message += `\n📡 API Endpoint: ${config.apiUrl}`;
            
            await ctx.reply(message, { parse_mode: 'Markdown' });
        } catch (error) {
            console.error('Status command error:', error);
            
            let errorMessage = `❌ *System Status Check Failed*\n\n`;
            errorMessage += `🤖 Bot: ✅ Online (you're seeing this message)\n`;
            errorMessage += `🌐 API: ❌ Connection failed\n\n`;
            
            if (error.response) {
                errorMessage += `📊 API Status: ${error.response.status} - ${error.response.statusText}\n`;
                errorMessage += `📝 Error Details: ${error.response.data?.error || 'Unknown API error'}\n`;
            } else if (error.code === 'ECONNREFUSED') {
                errorMessage += `📝 Error: API server connection refused\n`;
                errorMessage += `💡 Suggestion: Check if the API server is running\n`;
            } else if (error.code === 'ENOTFOUND') {
                errorMessage += `📝 Error: API server not found\n`;
                errorMessage += `💡 Suggestion: Verify API URL configuration\n`;
            } else {
                errorMessage += `📝 Error: ${error.message}\n`;
            }
            
            errorMessage += `\n📡 API Endpoint: ${config.apiUrl}`;
            
            await ctx.reply(errorMessage, { parse_mode: 'Markdown' });
        }
    });

    // Health check command (simple version for all users) - Enhanced
    bot.command(['health', 'ping'], async (ctx) => {
        try {
            const user = await new Promise(r => getUser(ctx.from.id, r));
            if (!user) {
                return ctx.reply('❌ You are not authorized to use this bot.');
            }

            const startTime = Date.now();
            
            try {
                const response = await axios.get(`${config.apiUrl}/health`, {
                    timeout: 8000,
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    }
                });
                const responseTime = Date.now() - startTime;
                
                const health = response.data;
                
                let message = `🏥 *Health Check*\n\n`;
                message += `🤖 Bot: ✅ Responsive\n`;
                message += `🌐 API: ${health.status === 'healthy' ? '✅' : '⚠️'} ${health.status || 'responding'}\n`;
                message += `⚡ Response Time: ${responseTime}ms\n`;
                
                // Add basic stats if available
                if (health.active_calls !== undefined) {
                    message += `📞 Active Calls: ${health.active_calls}\n`;
                }
                
                // Add database status if available
                if (health.services?.database?.connected !== undefined) {
                    message += `🗄️ Database: ${health.services.database.connected ? '✅' : '❌'} ${health.services.database.connected ? 'Connected' : 'Disconnected'}\n`;
                }
                
                message += `⏰ Checked: ${new Date().toLocaleTimeString()}`;
                
                await ctx.reply(message, { parse_mode: 'Markdown' });
            } catch (apiError) {
                const responseTime = Date.now() - startTime;
                
                let message = `🏥 *Health Check*\n\n`;
                message += `🤖 Bot: ✅ Responsive\n`;
                message += `🌐 API: ❌ Connection failed\n`;
                message += `⚡ Response Time: ${responseTime}ms (timeout)\n`;
                message += `⏰ Checked: ${new Date().toLocaleTimeString()}\n\n`;
                
                if (apiError.code === 'ECONNREFUSED') {
                    message += `📝 API server appears to be down`;
                } else if (apiError.code === 'ETIMEDOUT') {
                    message += `📝 API server is not responding (timeout)`;
                } else {
                    message += `📝 ${apiError.message}`;
                }
                
                await ctx.reply(message, { parse_mode: 'Markdown' });
            }
        } catch (error) {
            console.error('Health command error:', error);
            await ctx.reply(`🏥 *Health Check*\n\n🤖 Bot: ✅ Responsive\n🌐 API: ❌ Error\n⏰ Checked: ${new Date().toLocaleTimeString()}\n\n📝 ${error.message}`, { parse_mode: 'Markdown' });
        }
    });
};
