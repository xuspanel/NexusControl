#!/bin/bash
# NexusControl Log Aggregator
echo "📊 Tailing NexusControl Logs (Ctrl+C to exit)..."

# Tail systemd daemon, nginx error log, and internal audit log simultaneously
tail -f \
  /var/log/nginx/error.log \
  /opt/NexusControl/backend/nexus_audit.log \
  <(journalctl -u nexuscontrol -f -n 20)
