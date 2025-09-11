const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Setting up Vercel deployment for Voice Call Bot Mini App...\n');

// Check if vercel.json exists
const vercelConfigPath = path.join(__dirname, '../vercel.json');
if (!fs.existsSync(vercelConfigPath)) {
    console.log('📝 Creating vercel.json configuration...');
    const vercelConfig = {
        "version": 2,
        "name": "voicednut",
        "builds": [
            {
                "src": "server/webapp.js",
                "use": "@vercel/node"
            }
        ],
        "routes": [
            {
                "src": "/miniapp.html",
                "dest": "public/miniapp.html"
            },
            {
                "src": "/api/(.*)",
                "dest": "server/webapp.js"
            },
            {
                "src": "/(.*)",
                "dest": "server/webapp.js"
            }
        ],
        "env": {
            "NODE_ENV": "production"
        }
    };
    
    fs.writeFileSync(vercelConfigPath, JSON.stringify(vercelConfig, null, 2));
    console.log('✅ vercel.json created successfully!\n');
} else {
    console.log('✅ vercel.json already exists\n');
}

// Check if required files exist
const requiredFiles = [
    'server/webapp.js',
    'public/miniapp.html',
    'config.js'
];

console.log('🔍 Checking required files...');
for (const file of requiredFiles) {
    const filePath = path.join(__dirname, '..', file);
    if (fs.existsSync(filePath)) {
        console.log(`✅ ${file} exists`);
    } else {
        console.log(`❌ ${file} missing - please create this file first`);
        process.exit(1);
    }
}

console.log('\n📋 Pre-deployment checklist:');
console.log('1. ✅ All required files exist');
console.log('2. 🔄 Installing Vercel CLI...');

try {
    execSync('npm install -g vercel', { stdio: 'inherit' });
    console.log('3. ✅ Vercel CLI installed');
} catch (error) {
    console.log('3. ℹ️  Vercel CLI may already be installed');
}

console.log('\n🚀 Ready to deploy! Run the following commands:');
console.log('1. npx vercel login  (if not already logged in)');
console.log('2. npm run deploy:preview  (for testing)');
console.log('3. npm run deploy:vercel  (for production)');
console.log('\n🔐 Don\'t forget to set your environment variables in Vercel dashboard!');