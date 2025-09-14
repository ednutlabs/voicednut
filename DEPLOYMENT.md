# Deployment Setup Guide

## 1. GitHub Secrets Setup

Add these secrets to your GitHub repository (Settings > Secrets and variables > Actions):

```bash
# EC2 Access
EC2_SSH_PRIVATE_KEY    # Your EC2 SSH private key
EC2_KNOWN_HOSTS       # EC2 known_hosts entry
EC2_HOST             # Your EC2 instance public IP/domain
EC2_USERNAME         # EC2 SSH username

# Vercel Deployment
VERCEL_TOKEN        # Your Vercel API token (Get from vercel.com/account/tokens)

To get your Vercel token:
1. Visit https://vercel.com/account/tokens
2. Click "Create Token"
3. Name it "VoicedNut Deploy"
4. Set appropriate permissions
5. Copy token immediately after creation
```

## 2. EC2 Instance Setup

1. Install required software:

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2
sudo npm install -g pm2

# Install Git
sudo apt install -y git
```

2. Set up project directory:

```bash
cd ~
git clone https://github.com/Ednutz/voicednut.git
cd voicednut
```

3. Create environment files:

```bash
# API environment
cd api
cp .env.example .env
# Edit .env with your values

# Bot environment
cd ../bot
cp .env.example .env
# Edit .env with your values
```

4. Initial deployment:

```bash
# API setup
cd ~/voicednut/api
npm install
pm2 start ecosystem.config.js --only voicednut-api

# Bot setup
cd ~/voicednut/bot
npm install
pm2 start ecosystem.config.js --only voicednut-bot

# Save PM2 configuration
pm2 save
```

## 3. NGINX Setup (if using)

```nginx
server {
    server_name your-domain.com;

    # API
    location /api {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket
    location /ws {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }

    listen 443 ssl;
    # Add your SSL configuration here
}
```

## 4. Security Considerations

1. Configure your EC2 security group to allow:

   - SSH (port 22)
   - HTTP (port 80)
   - HTTPS (port 443)
   - WebSocket (port 8080)

2. Set up SSL certificates using Let's Encrypt:

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## 5. Testing Deployments

After setting up, test the automatic deployment by:

1. Making a change to any component
2. Pushing to the main branch
3. Checking GitHub Actions for deployment status
4. Verifying the changes on your EC2 instance

## 6. Monitoring

Monitor your applications using PM2:

```bash
pm2 status          # Check status
pm2 logs           # View logs
pm2 monit          # Monitor resources
```
