#!/usr/bin/env bash
set -e

echo "=== Testing Step 1 (Password) ==="
STEP1=$(curl -s -X POST http://127.0.0.1:8787/api/auth/step1 -H "Content-Type: application/json" -d '{"password":"nexus2026!"}')
TEMP_TOKEN=$(echo "$STEP1" | grep -o '"tempToken":"[^"]*' | cut -d'"' -f4)
echo "Step 1 OK: tempToken=${TEMP_TOKEN:0:12}..."

echo "=== Testing Step 2 (TOTP with failing SMTP) ==="
TOTP=$(node -e "const { generateSync } = require('/opt/NexusControl/backend/node_modules/otplib'); console.log(generateSync({ secret: 'DILHC56P77TWUDGUBPV466EZFI7462P7' }));")
RESPONSE_CODE=$(curl -s -o /tmp/step2_out.json -w "%{http_code}" -X POST http://127.0.0.1:8787/api/auth/step2-2fa -H "Content-Type: application/json" -d "{\"tempToken\":\"$TEMP_TOKEN\",\"totpCode\":\"$TOTP\"}")
echo "HTTP Status Code: $RESPONSE_CODE (Expected: 500)"
echo "Response Body   : $(cat /tmp/step2_out.json)"

echo "=== Checking Journalctl for Fallback 6-Digit Code ==="
journalctl -u nexuscontrol -n 12 --no-pager | grep -A 6 "CRITICAL AUTH FALLBACK" || true
