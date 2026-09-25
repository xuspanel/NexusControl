#!/bin/bash
# NexusControl Update Script

# Helper: Safely inject new environment variables without overwriting existing ones
ensure_env_var() {
    local key=$1
    local default_value=$2
    local env_file="/opt/NexusControl/backend/.env"
    
    if [ -f "$env_file" ]; then
        if ! grep -q "^${key}=" "$env_file"; then
            echo "${key}=${default_value}" >> "$env_file"
            echo "➕ Migrated missing config: ${key}"
        fi
    fi
}

echo "🔄 Initiating NexusControl Update..."
cd /opt/NexusControl || exit 1

echo "📦 Pulling latest codebase from GitHub..."
git stash --quiet # Safely tuck away any accidental local edits to tracked files
git pull origin main --force

echo "⚙️  Updating Backend Dependencies..."
cd /opt/NexusControl/backend
npm install --omit=dev

echo "🎨 Rebuilding Frontend UI..."
cd /opt/NexusControl/frontend
npm install && npm run build

cd /opt/NexusControl
echo "🔧 Running Smart Infrastructure Migrations..."

# 1. Ensure iptables is installed (Added in v1.0.1 for AlmaLinux WireGuard support)
if ! command -v iptables &> /dev/null; then
    echo "📦 Installing missing dependency: iptables..."
    dnf install -y iptables 2>/dev/null || apt-get install -y iptables 2>/dev/null
fi

# Safely inject PUBLIC_IP if the user updated from an older version
SERVER_PUBLIC_IP=$(curl -sS --max-time 5 ifconfig.me || echo "127.0.0.1")
ensure_env_var "PUBLIC_IP" "$SERVER_PUBLIC_IP"

# Example: Future variables can just be added like this:
# ensure_env_var "NEW_FEATURE_TOGGLE" "true"

# WireGuard interface migration (Only touches it if 'eth0' is hardcoded)
if [ -f "/etc/wireguard/wg0.conf" ] && grep -q "eth0" "/etc/wireguard/wg0.conf"; then
    DEFAULT_IFACE=$(ip route ls default | awk '{print $5}' | head -n 1)
    echo "🔄 Migrating WireGuard config to use dynamic interface: $DEFAULT_IFACE..."
    wg-quick down wg0 2>/dev/null
    sed -i "s/eth0/$DEFAULT_IFACE/g" /etc/wireguard/wg0.conf
    wg-quick up wg0 2>/dev/null
fi

echo "🚀 Restarting NexusControl Daemon..."
systemctl restart nexuscontrol

echo "✅ Update Complete! NexusControl is running the latest version."
