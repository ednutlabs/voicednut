require('dotenv').config();
const fs = require('fs');
const path = require('path');

function validateConfig() {
    console.log('🔍 Validating configuration...\n');
    
    const requiredEnvVars = [
        'BOT_TOKEN',
        'API_BASE'
    ];
    
    const optionalEnvVars = [
        'WEB_APP_URL',
        'WEB_APP_SECRET',
        'ADMIN_TELEGRAM_USERNAME'
    ];
    
    let hasErrors = false;
    
    // Check required environment variables
    console.log('📋 Required Environment Variables:');
    for (const envVar of requiredEnvVars) {
        if (process.env[envVar]) {
            console.log(`✅ ${envVar} is set`);
        } else {
            console.log(`❌ ${envVar} is missing`);
            hasErrors = true;
        }
    }
    
    console.log('\n📋 Optional Environment Variables:');
    for (const envVar of optionalEnvVars) {
        if (process.env[envVar]) {
            console.log(`✅ ${envVar} is set`);
        } else {
            console.log(`⚠️  ${envVar} is not set (optional)`);
        }
    }
    
    // Check file structure
    console.log('\n📁 File Structure:');
    const requiredFiles = [
        'bot.js',
        'config.js',
        'server/webapp.js',
        'public/miniapp.html',
        'package.json',
        'vercel.json'
    ];
    
    for (const file of requiredFiles) {
        const filePath = path.join(__dirname, '..', file);
        if (fs.existsSync(filePath)) {
            console.log(`✅ ${file} exists`);
        } else {
            console.log(`❌ ${file} is missing`);
            hasErrors = true;
        }
    }
    
    // Check package.json dependencies
    console.log('\n📦 Dependencies:');
    const packageJsonPath = path.join(__dirname, '../package.json');
    if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        const requiredDeps = ['grammy', 'express', 'cors', 'axios'];
        
        for (const dep of requiredDeps) {
            if (packageJson.dependencies && packageJson.dependencies[dep]) {
                console.log(`✅ ${dep} is installed`);
            } else {
                console.log(`❌ ${dep} is missing from dependencies`);
                hasErrors = true;
            }
        }
    }
    
    if (hasErrors) {
        console.log('\n❌ Configuration has errors. Please fix them before deploying.');
        process.exit(1);
    } else {
        console.log('\n✅ Configuration looks good! Ready for deployment.');
    }
}

if (require.main === module) {
    validateConfig();
}

module.exports = validateConfig;
