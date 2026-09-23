#!/bin/bash
# NexusControl Diagnostic Wizard & Common Error Checker

echo "🔍 Initiating NexusControl Diagnostics..."
echo "----------------------------------------"

# 1. RAM Footprint Verification
NODE_PID=$(pgrep -f "node server.js")
if [ -n "$NODE_PID" ]; then
    RAM_USAGE=$(ps -o rss= -p "$NODE_PID" | awk '{print $1/1024}')
    echo "🧠 Memory Footprint: Node daemon is using ${RAM_USAGE}MB"
else
    echo "❌ ERROR: Node daemon is not running."
    echo "   FIX: Run 'systemctl restart nexuscontrol' and check 'journalctl -u nexuscontrol -e'"
fi

# 2. Port Binding Checks (8787, 80, 443, 51820)
if ! ss -tuln | grep -q ":8787 "; then
    echo "❌ ERROR: Port 8787 is not bound. The backend failed to start."
    echo "   FIX: Check if another app is using it, or if the .env file is missing."
fi

if ! ss -tuln | grep -q ":51820 "; then
    echo "⚠️  WARNING: WireGuard UDP Port 51820 is not listening."
    echo "   FIX: If you use the VPN, ensure wg0 is up: 'wg-quick up wg0'"
fi

# 3. SQLite Integrity Check
if command -v sqlite3 >/dev/null 2>&1; then
    DB_CHECK=$(sqlite3 /opt/NexusControl/backend/metrics.db "PRAGMA integrity_check;" 2>/dev/null)
    if echo "$DB_CHECK" | grep -q "ok"; then
        echo "💾 Database Integrity: OK"
    else
        echo "❌ ERROR: Database corruption detected in metrics.db."
        echo "   FIX: Restore from the latest Zstd backup in /opt/nexus_backups/"
    fi
fi

# 4. Network & Firewall Routing (Oracle/UFW)
IP_FORWARD=$(sysctl -n net.ipv4.ip_forward)
if [ "$IP_FORWARD" != "1" ]; then
    echo "❌ ERROR: IPv4 Forwarding is disabled. VPN clients will have no internet."
    echo "   FIX: Run 'sysctl -w net.ipv4.ip_forward=1'"
fi

echo "----------------------------------------"
echo "💡 COMMON ERROR QUICK-REFERENCE:"
echo "- Nginx 502 Bad Gateway: The Node daemon is down or restarting. Run ./logs.sh"
echo "- VPN Connects but No Data: Oracle Cloud Firewall is blocking UDP 51820. Open it in the Web Console."
echo "- Users cannot login: Check if SQLite WAL mode is locked due to permissions."
echo "✅ Diagnostics Complete."
