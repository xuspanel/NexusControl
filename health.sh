#!/bin/bash
# NexusControl Health Monitor
STATUS=0

echo "🏥 Checking NexusControl Health..."

# 1. Check Systemd Daemon
if ! systemctl is-active --quiet nexuscontrol; then
    echo "❌ ERROR: nexuscontrol.service is DOWN."
    STATUS=1
fi

# 2. Check Nginx Reverse Proxy
if ! systemctl is-active --quiet nginx; then
    echo "❌ ERROR: nginx.service is DOWN."
    STATUS=1
fi

# 3. Check HTTP Health Endpoint
if ! curl -s -f http://127.0.0.1:8787/health > /dev/null; then
    echo "❌ ERROR: Backend API /health endpoint is unresponsive."
    STATUS=1
fi

if [ $STATUS -eq 0 ]; then
    echo "✅ ALL SYSTEMS GO: NexusControl is healthy."
fi

exit $STATUS
