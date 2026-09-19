#!/usr/bin/env bash
set -e

echo "=== Testing IP Whitelist ==="
CODE_OK=$(curl -s -o /dev/null -w "%{http_code}" -H "X-Forwarded-For: 51.36.170.29" http://127.0.0.1:8787/health)
CODE_BAD=$(curl -s -o /dev/null -w "%{http_code}" -H "X-Forwarded-For: 198.51.100.1" http://127.0.0.1:8787/health)
echo "Whitelisted IP (51.36.170.29): HTTP $CODE_OK (Expected: 200)"
echo "Untrusted IP (198.51.100.1): HTTP $CODE_BAD (Expected: 403)"

echo "=== Testing Multi-Step Auth ==="
# Step 1: Master Password
STEP1_RES=$(curl -s -X POST http://127.0.0.1:8787/api/auth/step1 -H "Content-Type: application/json" -d '{"password":"nexus2026!"}')
echo "Step 1: $STEP1_RES"
TEMP_TOKEN=$(echo "$STEP1_RES" | grep -o '"tempToken":"[^"]*' | cut -d'"' -f4)

# Generate TOTP using node
TOTP_CODE=$(node -e "const { generateSync } = require('/opt/NexusControl/backend/node_modules/otplib'); console.log(generateSync({ secret: 'DILHC56P77TWUDGUBPV466EZFI7462P7' }));")
echo "Generated TOTP: $TOTP_CODE"

# Step 2: 2FA TOTP
STEP2_RES=$(curl -s -X POST http://127.0.0.1:8787/api/auth/step2-2fa -H "Content-Type: application/json" -d "{\"tempToken\":\"$TEMP_TOKEN\",\"totpCode\":\"$TOTP_CODE\"}")
echo "Step 2: $STEP2_RES"

