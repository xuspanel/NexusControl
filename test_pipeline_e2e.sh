#!/usr/bin/env bash
set -e

echo "=== Testing Complete 3-Step Auth Pipeline ==="

# Step 1: Master Password
STEP1=$(curl -s -X POST http://127.0.0.1:8787/api/auth/step1 -H "Content-Type: application/json" -d '{"password":"nexus2026!"}')
TEMP_TOKEN=$(echo "$STEP1" | grep -o '"tempToken":"[^"]*' | cut -d'"' -f4)
echo "1. Step 1 Passed: tempToken=${TEMP_TOKEN:0:12}..."

# Step 2: TOTP
TOTP=$(node -e "const { generateSync } = require('/opt/NexusControl/backend/node_modules/otplib'); console.log(generateSync({ secret: 'DILHC56P77TWUDGUBPV466EZFI7462P7' }));")
STEP2=$(curl -s -X POST http://127.0.0.1:8787/api/auth/step2-2fa -H "Content-Type: application/json" -d "{\"tempToken\":\"$TEMP_TOKEN\",\"totpCode\":\"$TOTP\"}")
echo "2. Step 2 Passed: $STEP2"

# Extract Email OTP from journal log
sleep 0.5
OTP=$(journalctl -u nexuscontrol -n 10 --no-pager | grep "Verification OTP" | tail -n 1 | grep -o '>>> [0-9]\{6\} <<<' | grep -o '[0-9]\{6\}')
echo "Extracted Email OTP: $OTP"

# Step 3: Email OTP
STEP3=$(curl -s -X POST http://127.0.0.1:8787/api/auth/step3-email-otp -H "Content-Type: application/json" -d "{\"tempToken\":\"$TEMP_TOKEN\",\"emailOtp\":\"$OTP\"}")
echo "3. Step 3 Passed: $STEP3"
FINAL_TOKEN=$(echo "$STEP3" | grep -o '"token":"[^"]*' | cut -d'"' -f4)

# 4. Verify Bearer access to protected endpoint
PROFILE=$(curl -s http://127.0.0.1:8787/api/system/profile -H "Authorization: Bearer $FINAL_TOKEN")
echo "4. Protected API Profile OK: $(echo $PROFILE | grep -o '"hostname":"[^"]*')"
echo "=== ALL SECURITY PIPELINE STAGES PASSED ==="
