#!/bin/bash

# Diagnostic script to check if LLM settings endpoints are working

echo "🔍 Checking LLM Settings API Endpoints..."
echo ""

# Check if server is running
echo "1️⃣  Checking if server is running on port 3000..."
if nc -z localhost 3000 2>/dev/null; then
  echo "   ✅ Server is running on port 3000"
else
  echo "   ❌ Server not responding on port 3000"
  echo "   💡 Start the server with: npm run server"
  exit 1
fi

echo ""
echo "2️⃣  Testing GET /api/settings/llm endpoint..."

# Test without password
echo "   Testing without password:"
RESPONSE=$(curl -s -w "\n%{http_code}" http://localhost:3000/api/settings/llm)
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | head -n -1)

echo "   HTTP Status: $HTTP_CODE"
echo "   Response: $BODY" | head -c 200
echo ""

if [ "$HTTP_CODE" = "200" ]; then
  echo "   ✅ Endpoint works without password"
elif [ "$HTTP_CODE" = "401" ]; then
  echo "   ⚠️  Endpoint requires password (expected if APP_PASSWORD is set)"
else
  echo "   ❌ Unexpected response code: $HTTP_CODE"
fi

echo ""
echo "3️⃣  Testing PUT /api/settings/llm endpoint..."

RESPONSE=$(curl -s -w "\n%{http_code}" -X PUT \
  -H "Content-Type: application/json" \
  -d '{"useOllama": false, "claudeModel": "claude-opus-4-1-20250805"}' \
  http://localhost:3000/api/settings/llm)
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | head -n -1)

echo "   HTTP Status: $HTTP_CODE"
echo "   Response: $BODY" | head -c 200
echo ""

echo ""
echo "4️⃣  Checking environment variables..."
echo "   USE_OLLAMA: ${USE_OLLAMA:-not set}"
echo "   OLLAMA_MODEL: ${OLLAMA_MODEL:-not set}"
echo "   ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:+set (****)}"

echo ""
echo "5️⃣  Browser Debugging Steps:"
echo "   1. Open browser DevTools (F12)"
echo "   2. Go to Console tab"
echo "   3. Look for 📡 messages showing fetch requests"
echo "   4. Check Network tab for /api/settings/llm requests"
echo "   5. Look for 401 Unauthorized or other errors"

echo ""
echo "✅ Diagnostic complete!"
