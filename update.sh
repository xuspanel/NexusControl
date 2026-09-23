#!/bin/bash
# NexusControl Update Script

echo "🔄 Initiating NexusControl Update..."
cd /opt/NexusControl || exit 1

echo "📦 Pulling latest changes from GitHub..."
git fetch --all
git reset --hard origin/main

echo "⚙️  Updating Backend Dependencies..."
cd backend
npm ci --omit=dev

echo "🎨 Rebuilding Frontend UI..."
cd ../frontend
npm ci
npm run build

echo "🚀 Restarting NexusControl Daemon..."
systemctl restart nexuscontrol

echo "✅ Update Complete! NexusControl is running the latest version."
