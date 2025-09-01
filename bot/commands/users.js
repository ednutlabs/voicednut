const { getUserList, getUser, isAdmin } = require('../db/db');

module.exports = (bot) => {
    bot.command('users', async (ctx) => {
        try {
            // Check authorization first
                        // Check if user is authorized and is admin
            const user = await new Promise(r => getUser(ctx.from.id, r));
            if (!user) {
                return ctx.reply('❌ You are not authorized to use this bot.');
            }

            const adminStatus = await new Promise(r => isAdmin(ctx.from.id, r));
            if (!adminStatus) {
                return ctx.reply('❌ This command is for administrators only.');
            }

            // Get users list with proper error handling
            const users = await new Promise((resolve, reject) => {
                getUserList((err, result) => {
                    if (err) {
                        console.error('Database error in getUserList:', err);
                        resolve([]); // Resolve with empty array instead of rejecting
                    } else {
                        resolve(result || []); // Ensure we always resolve with an array
                    }
                });
            });

            if (!users || users.length === 0) {
                await ctx.reply('📋 No users found in the system.');
                return;
            }

            // Format users list safely - use plain text to avoid markdown issues
            let message = `📋 USERS LIST (${users.length}):\n\n`;
            
            users.forEach((user, index) => {
                const roleIcon = user.role === 'ADMIN' ? '🛡️' : '👤';
                const username = user.username || 'no_username';
                const joinDate = new Date(user.timestamp).toLocaleDateString();
                message += `${index + 1}. ${roleIcon} @${username}\n`;
                message += `   ID: ${user.telegram_id}\n`;
                message += `   Role: ${user.role}\n`;
                message += `   Joined: ${joinDate}\n\n`;
            });

            // Send without parse_mode to avoid markdown parsing errors
            await ctx.reply(message);

        } catch (error) {
            console.error('Users command error:', error);
            await ctx.reply('❌ Error fetching users list. Please try again.');
        }
    });
};
