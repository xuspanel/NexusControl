#!/bin/bash
# NexusControl Update Script

echo "🔄 Initiating NexusControl Update..."
cd /opt/NexusControl || exit 1

echo "📦 Pulling latest changes from GitHub..."
git fetch --all
git reset --hard origin/main

echo "⚙️  Updating Backend Dependencies..."
cd /opt/NexusControl/backend
npm install --omit=dev

echo "🎨 Rebuilding Frontend UI..."
cd /opt/NexusControl/frontend
npm install && npm run build

cd /opt/NexusControl
echo "🔧 Running Infrastructure Migrations & Dependency Checks..."

# 1. Ensure iptables is installed (Added in v1.0.1 for AlmaLinux WireGuard support)
if ! command -v iptables &> /dev/null; then
    echo "📦 Installing missing dependency: iptables..."
    dnf install -y iptables 2>/dev/null || apt-get install -y iptables 2>/dev/null
fi

# 2. Migrate existing wg0.conf away from hardcoded 'eth0'
if [ -f "/etc/wireguard/wg0.conf" ]; then
    DEFAULT_IFACE=$(ip route ls default | awk '{print $5}' | head -n 1)
    if grep -q "eth0" "/etc/wireguard/wg0.conf"; then
        echo "🔄 Migrating WireGuard config to use dynamic interface: $DEFAULT_IFACE..."
        wg-quick down wg0 2>/dev/null
        sed -i "s/eth0/$DEFAULT_IFACE/g" /etc/wireguard/wg0.conf
        wg-quick up wg0 2>/dev/null
    fi
fi

# 3. Migrate .env to include PUBLIC_IP
if ! grep -q "^PUBLIC_IP=" "/opt/NexusControl/backend/.env"; then
    echo "🔄 Migrating .env to include PUBLIC_IP..."
    SERVER_PUBLIC_IP=$(curl -sS --max-time 5 ifconfig.me || echo "127.0.0.1")
    echo "PUBLIC_IP=$SERVER_PUBLIC_IP" >> /opt/NexusControl/backend/.env
fi

echo "🚀 Restarting NexusControl Daemon..."
systemctl restart nexuscontrol

echo "✅ Update Complete! NexusControl is running the latest version."
