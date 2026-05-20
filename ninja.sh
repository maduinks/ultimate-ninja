#!/bin/bash
# Ultimate Ninja launcher — starts server + ngrok and prints the share URL

GAME_DIR="$(cd "$(dirname "$0")" && pwd)"
PORT=8080

echo "🥷  Starting Ultimate Ninja..."

# Kill any existing server/ngrok on the port
lsof -ti:$PORT | xargs kill -9 2>/dev/null
pkill ngrok 2>/dev/null
sleep 1

# Start game server
node "$GAME_DIR/server.js" &
SERVER_PID=$!
sleep 1

# Check server started
if ! lsof -ti:$PORT > /dev/null 2>&1; then
  echo "❌  Server failed to start"
  exit 1
fi
echo "✅  Server running on http://localhost:$PORT"

# Start ngrok
ngrok http $PORT --log=stdout > /tmp/ninja-ngrok.log 2>&1 &
NGROK_PID=$!
sleep 4

# Get public URL
PUBLIC_URL=$(curl -s http://localhost:4040/api/tunnels 2>/dev/null | \
  python3 -c "import sys,json; t=json.load(sys.stdin)['tunnels']; print(next((x['public_url'] for x in t if x['public_url'].startswith('https')), ''))" 2>/dev/null)

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  🏠  Local:   http://localhost:$PORT"
if [ -n "$PUBLIC_URL" ]; then
  echo "  🌍  Online:  $PUBLIC_URL"
  echo "  📋  Share this URL with friends (use Chrome)"
else
  echo "  ⚠️   ngrok not available — local play only"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Open browser
open "http://localhost:$PORT" 2>/dev/null

echo "Press Ctrl+C to stop the server."
wait $SERVER_PID
