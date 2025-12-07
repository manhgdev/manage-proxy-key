#!/bin/bash

# Fast deployment with PM2

echo "🚀 Starting deployment..."

# Build the Next.js app first
echo "📦 Building Next.js..."
bun run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed! Aborting deployment."
    exit 1
fi

echo "✅ Build successful!"

# Fast restart (1-2 seconds downtime only)
if pm2 list | grep -q "proxy_8000"; then
    echo "🔄 Restarting PM2 (fast restart)..."
    pm2 restart proxy_8000
else
    echo "🆕 Starting PM2..."
    pm2 start pm2.config.json
fi

pm2 save

echo "✅ Deployment completed! (~1-2s downtime)"
pm2 list
