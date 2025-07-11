const { getUserList, getUser } = require('../db/db');

module.exports = (bot) => {
    bot.command('users', async (ctx) => {
        try {
            const user = await new Promise(r => getUser(ctx.from.id, r));
            if (!user || user.role !== 'ADMIN') {
                await ctx.reply('❌ Admin only.');
                return;
            }

            const users = await new Promise(r => getUserList(r));
            if (!users.length) {
                await ctx.reply('No users found.');
                return;
            }

            const userList = users.map(u => 
                `${u.role === 'ADMIN' ? '🛡️' : '👤'} @${u.username} (${u.telegram_id})`
            ).join('\n');

            await ctx.reply(`*Users List:*\n${userList}`, {
                parse_mode: 'Markdown'
            });
        } catch (error) {
            console.error('Users command error:', error);
            await ctx.reply('❌ An error occurred. Please try again.');
        }
    });
};