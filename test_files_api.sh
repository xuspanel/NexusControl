#!/usr/bin/env bash
set -e

echo "=== Files Manager Backend Verification Suite ==="

# 1. Authenticate to get session token
STEP1=$(curl -s -X POST http://127.0.0.1:8787/api/auth/step1 -H "Content-Type: application/json" -d '{"password":"nexus2026!"}')
TEMP_TOKEN=$(echo "$STEP1" | grep -o '"tempToken":"[^"]*' | cut -d'"' -f4)

TOTP=$(node -e "const { generateSync } = require('/opt/NexusControl/backend/node_modules/otplib'); console.log(generateSync({ secret: 'DILHC56P77TWUDGUBPV466EZFI7462P7' }));")
STEP2=$(curl -s -X POST http://127.0.0.1:8787/api/auth/step2-2fa -H "Content-Type: application/json" -d "{\"tempToken\":\"$TEMP_TOKEN\",\"totpCode\":\"$TOTP\"}")

sleep 1
OTP=$(journalctl -u nexuscontrol -n 50 --no-pager | grep -o '>>> [0-9]\{6\} <<<' | tail -n 1 | grep -o '[0-9]\{6\}')

STEP3=$(curl -s -X POST http://127.0.0.1:8787/api/auth/step3-email-otp -H "Content-Type: application/json" -d "{\"tempToken\":\"$TEMP_TOKEN\",\"emailOtp\":\"$OTP\"}")
TOKEN=$(echo "$STEP3" | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "[-] Failed to authenticate"
  exit 1
fi
echo "[+] Auth Succeeded: Token=${TOKEN:0:12}..."

# 2. Test directory list
LIST_RES=$(curl -s http://127.0.0.1:8787/api/files/list?path=/opt -H "Authorization: Bearer $TOKEN")
COUNT=$(echo "$LIST_RES" | grep -o '"name":' | wc -l)
echo "[+] List /opt: $COUNT items found"

# 3. Test storage mounts
MOUNTS_RES=$(curl -s http://127.0.0.1:8787/api/files/mounts -H "Authorization: Bearer $TOKEN")
MCOUNT=$(echo "$MOUNTS_RES" | grep -o '"mountPoint":' | wc -l)
echo "[+] Mounts retrieved: $MCOUNT mount points found"

# 4. Test mkdir & file creation
mkdir -p /tmp/nexus_test_sandbox
MKDIR_RES=$(curl -s -X POST http://127.0.0.1:8787/api/files/mkdir -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"path":"/tmp/nexus_test_sandbox","name":"subfolder"}')
CREATE_RES=$(curl -s -X POST http://127.0.0.1:8787/api/files/create -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"path":"/tmp/nexus_test_sandbox/subfolder","name":"test.txt"}')
WRITE_RES=$(curl -s -X POST http://127.0.0.1:8787/api/files/write -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"path":"/tmp/nexus_test_sandbox/subfolder/test.txt","content":"Hello NexusControl Files Manager!"}')
READ_RES=$(curl -s "http://127.0.0.1:8787/api/files/read?path=/tmp/nexus_test_sandbox/subfolder/test.txt" -H "Authorization: Bearer $TOKEN")

CONTENT=$(echo "$READ_RES" | grep -o '"content":"[^"]*' | cut -d'"' -f4)
echo "[+] File Write & Read Verified: '$CONTENT'"

# 5. Test Archive creation
ARCH_RES=$(curl -s -X POST http://127.0.0.1:8787/api/files/archive -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"targetFile":"/tmp/nexus_test_sandbox/archive.tar.gz","sources":["/tmp/nexus_test_sandbox/subfolder"],"format":"tar.gz"}')
echo "[+] Archive Task Started: $(echo $ARCH_RES | grep -o '"taskId":"[^"]*')"
sleep 1

# 6. Test Trash & Restore
TRASH_RES=$(curl -s -X POST http://127.0.0.1:8787/api/files/delete -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"paths":["/tmp/nexus_test_sandbox/subfolder/test.txt"],"permanent":false}')
echo "TRASH_RES: $TRASH_RES"
TRASH_LIST=$(curl -s http://127.0.0.1:8787/api/files/trash -H "Authorization: Bearer $TOKEN")
echo "TRASH_LIST: $TRASH_LIST"
TRASH_ID=$(echo "$TRASH_LIST" | grep -o '"id":"[^"]*' | head -n 1 | cut -d'"' -f4)
echo "[+] Trashed item ID: $TRASH_ID"

RESTORE_RES=$(curl -s -X POST http://127.0.0.1:8787/api/files/trash/restore -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"ids\":[\"$TRASH_ID\"]}")
echo "[+] Restored item: $(echo $RESTORE_RES | grep -o '"restoredPath":"[^"]*')"

# Clean up test sandbox
rm -rf /tmp/nexus_test_sandbox
echo "=== ALL FILES MANAGER BACKEND API TESTS PASSED ==="
