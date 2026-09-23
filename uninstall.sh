#!/bin/bash
# NexusControl Uninstall Script

echo "⚠️  WARNING: You are about to uninstall NexusControl."
read -p "Are you sure you want to proceed? [y/N]: " CONFIRM_UNINSTALL
if [[ ! "$CONFIRM_UNINSTALL" =~ ^[Yy]$ ]]; then
    echo "Uninstall canceled."
    exit 0
fi

echo "🛑 Stopping and disabling systemd service..."
systemctl stop nexuscontrol 2>/dev/null
systemctl disable nexuscontrol 2>/dev/null
rm -f /etc/systemd/system/nexuscontrol.service
systemctl daemon-reload

echo "🧹 Removing Nginx configuration..."
rm -f /etc/nginx/conf.d/nxpanel.xus.me.conf
rm -f /etc/nginx/conf.d/nexuscontrol.conf
rm -f /etc/nginx/sites-available/nexuscontrol.conf
rm -f /etc/nginx/sites-enabled/nexuscontrol.conf
systemctl restart nginx 2>/dev/null

read -p "🚨 Do you want to PURGE ALL DATA? This will delete the SQLite database, .env keys, WireGuard VPN configurations, and ALL automated backups. [y/N]: " PURGE_DATA
if [[ "$PURGE_DATA" =~ ^[Yy]$ ]]; then
    echo "🔥 Purging all data..."
    rm -rf /opt/NexusControl
    rm -rf /opt/nexus_backups
    wg-quick down wg0 2>/dev/null
    rm -f /etc/wireguard/wg0.conf
    echo "✅ NexusControl and all associated data have been completely removed."
else
    echo "📦 Removing application files, but keeping databases, backups, and VPN configs..."
    # Keep the directory but remove standard app files to allow re-installation
    find /opt/NexusControl -mindepth 1 -maxdepth 1 ! -name 'backend' ! -name '.git' -exec rm -rf {} +
    # Inside backend, only keep .env and metrics.db
    find /opt/NexusControl/backend -mindepth 1 -maxdepth 1 ! -name '.env' ! -name 'metrics.db' ! -name 'nexus_audit.log' -exec rm -rf {} +
    echo "✅ NexusControl uninstalled. User data preserved in /opt/NexusControl and /opt/nexus_backups."
fi
