#!/bin/bash

echo "🚀 Starting deployment process..."
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    print_error "npm is not installed. Please install npm first."
    exit 1
fi

# Validate configuration
echo "🔍 Validating configuration..."
npm run validate:config
if [ $? -ne 0 ]; then
    print_error "Configuration validation failed. Please fix the issues above."
    exit 1
fi
print_status "Configuration validated"

# Install dependencies
echo "📦 Installing dependencies..."
npm install
if [ $? -ne 0 ]; then
    print_error "Failed to install dependencies"
    exit 1
fi
print_status "Dependencies installed"

# Check if user is logged into Vercel
echo "🔐 Checking Vercel authentication..."
if ! npx vercel whoami &> /dev/null; then
    print_warning "You are not logged into Vercel. Please run 'npx vercel login' first."
    echo "Would you like to login now? (y/n)"
    read -r response
    if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
        npx vercel login
    else
        print_error "Deployment cancelled. Please login to Vercel first."
        exit 1
    fi
fi
print_status "Vercel authentication confirmed"

# Deploy to Vercel
echo "🚀 Deploying to Vercel..."
npx vercel --prod --confirm
if [ $? -ne 0 ]; then
    print_error "Deployment failed"
    exit 1
fi

# Get the deployment URL
DEPLOYMENT_URL=$(npx vercel ls --scope=$(npx vercel whoami) | grep "voice-call-bot-miniapp" | head -1 | awk '{print $2}')
if [ -n "$DEPLOYMENT_URL" ]; then
    print_status "Deployment successful!"
    echo ""
    echo "🌐 Your Mini App is now available at:"
    echo "   https://$DEPLOYMENT_URL/miniapp.html"
    echo ""
    echo "📋 Next steps:"
    echo "1. Update your bot configuration with the new URL"
    echo "2. Update BotFather with the Mini App URL"
    echo "3. Test the Mini App in Telegram"
    echo "4. Set up environment variables in Vercel dashboard if not done already"
    echo ""
    echo "🔗 Vercel Dashboard: https://vercel.com/dashboard"
else
    print_warning "Deployment completed but couldn't retrieve URL. Check Vercel dashboard."
fi

echo "✨ Deployment process completed!"