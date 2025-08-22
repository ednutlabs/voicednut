const config = require('../config');
const axios = require('axios');
const { getUser, isAdmin } = require('../db/db');

module.exports = (bot) => {
    // API test command (enhanced)
    bot.command('test_api', async (ctx) => {
        try {
            // Check if user is authorized
            const user = await new Promise(r => getUser(ctx.from.id, r));
            if (!user) {
                return ctx.reply('❌ You are not authorized to use this bot.');
            }

            console.log('Testing API connection to:', config.apiUrl);
            const response = await axios.get(`${config.apiUrl}/health`, {
                timeout: 10000
            });
            
            const health = response.data;
            
            let message = `✅ *API Status: ${health.status}*\n\n`;
            message += `🔗 URL: ${config.apiUrl}\n`;
            message += `📊 Active Calls: ${health.active_calls || 0}\n`;
            message += `📋 Recent Calls: ${health.recent_calls || 0}\n`;
            message += `🗄️ Database: ${health.database_connected ? '✅ Connected' : '❌ Disconnected'}\n`;
            message += `⏰ Timestamp: ${new Date(health.timestamp).toLocaleString()}`;
            
            await ctx.reply(message, { parse_mode: 'Markdown' });
        } catch (error) {
            console.error('API test failed:', error.message);
            await ctx.reply(`❌ *API Test Failed*\n\nURL: ${config.apiUrl}\nError: ${error.message}`, { parse_mode: 'Markdown' });
        }
    });

    // Status command (admin only)
    bot.command('status', async (ctx) => {
        try {
            // Check if user is admin
            const user = await new Promise(r => getUser(ctx.from.id, r));
            const adminStatus = await new Promise(r => isAdmin(ctx.from.id, r));
            
            if (!user || !adminStatus) {
                return ctx.reply('❌ This command is for administrators only.');
            }

            const response = await axios.get(`${config.apiUrl}/health`, {
                timeout: 10000
            });
            
            const health = response.data;
            
            let message = `🔍 *System Status*\n\n`;
            message += `🤖 Bot: ✅ Online\n`;
            message += `🌐 API: ${health.status === 'healthy' ? '✅' : '❌'} ${health.status}\n`;
            message += `🗄️ Database: ${health.database_connected ? '✅ Connected' : '❌ Disconnected'}\n`;
            message += `📊 Active Calls: ${health.active_calls || 0}\n`;
            message += `📋 Recent Calls: ${health.recent_calls || 0}\n`;
            message += `⏰ Last Check: ${new Date(health.timestamp).toLocaleString()}\n\n`;
            message += `📡 API Endpoint: ${config.apiUrl}`;
            
            await ctx.reply(message, { parse_mode: 'Markdown' });
        } catch (error) {
            console.error('Status command error:', error);
            await ctx.reply(`❌ *System Status Check Failed*\n\nError: ${error.message}`, { parse_mode: 'Markdown' });
        }
    });

    // Health check command (simple version for all users)
    bot.command(['health', 'ping'], async (ctx) => {
        try {
            const user = await new Promise(r => getUser(ctx.from.id, r));
            if (!user) {
                return ctx.reply('❌ You are not authorized to use this bot.');
            }

            const startTime = Date.now();
            const response = await axios.get(`${config.apiUrl}/health`, {
                timeout: 5000
            });
            const responseTime = Date.now() - startTime;
            
            const health = response.data;
            
            let message = `🏥 *Health Check*\n\n`;
            message += `🤖 Bot: ✅ Responsive\n`;
            message += `🌐 API: ${health.status === 'healthy' ? '✅' : '❌'} ${health.status}\n`;
            message += `⚡ Response Time: ${responseTime}ms\n`;
            message += `⏰ Checked: ${new Date().toLocaleTimeString()}`;
            
            await ctx.reply(message, { parse_mode: 'Markdown' });
        } catch (error) {
            console.error('Health command error:', error);
            await ctx.reply(`❌ *Health Check Failed*\n\nBot is online but API connection failed.\nError: ${error.message}`, { parse_mode: 'Markdown' });
        }
    });
};