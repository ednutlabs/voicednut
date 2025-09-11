const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function testMiniApp() {
    console.log('🧪 Testing Mini App deployment...\n');
    
    // Read vercel.json to get project info
    const vercelConfigPath = path.join(__dirname, '../vercel.json');
    if (!fs.existsSync(vercelConfigPath)) {
        console.log('❌ vercel.json not found. Run npm run deploy:setup first.');
        return;
    }
    
    // Try to get the Vercel URL from environment or ask user
    let appUrl = process.env.WEB_APP_URL;
    if (!appUrl) {
        console.log('🌐 Please provide your Vercel app URL (e.g., your-app.vercel.app):');
        appUrl = 'your-app.vercel.app'; // Placeholder - in real usage, you'd prompt for input
    }
    
    if (!appUrl.startsWith('http')) {
        appUrl = `https://${appUrl}`;
    }
    
    const tests = [
        {
            name: 'Health Check',
            url: `${appUrl}/`,
            expected: 'healthy'
        },
        {
            name: 'Mini App HTML',
            url: `${appUrl}/miniapp.html`,
            expected: 'Voice Call Bot'
        },
        {
            name: 'API Endpoint',
            url: `${appUrl}/api/user-stats/123`,
            expected: 'total_calls'
        }
    ];
    
    for (const test of tests) {
        try {
            console.log(`🔍 Testing: ${test.name}...`);
            const response = await axios.get(test.url, { timeout: 10000 });
            
            if (response.status === 200) {
                const content = typeof response.data === 'string' 
                    ? response.data 
                    : JSON.stringify(response.data);
                    
                if (content.includes(test.expected)) {
                    console.log(`✅ ${test.name} - PASSED`);
                } else {
                    console.log(`⚠️  ${test.name} - Response doesn't contain expected content`);
                }
            } else {
                console.log(`❌ ${test.name} - HTTP ${response.status}`);
            }
        } catch (error) {
            console.log(`❌ ${test.name} - Error: ${error.message}`);
        }
    }
    
    console.log('\n📱 Manual testing checklist:');
    console.log('1. Open your Telegram bot');
    console.log('2. Send /start command');
    console.log('3. Click "🚀 Open Mini App" button');
    console.log('4. Verify the Mini App loads correctly');
    console.log('5. Test making a call or sending SMS');
    console.log(`\n🔗 Mini App URL: ${appUrl}/miniapp.html`);
}

if (require.main === module) {
    testMiniApp().catch(console.error);
}

module.exports = testMiniApp;