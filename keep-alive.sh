#!/bin/bash

# ============================================================
#  keep-alive.sh — Prevent Render free tier from sleeping
#  Usage: bash keep-alive.sh [URL]
#  Example: bash keep-alive.sh https://sri6ha.onrender.com
# ============================================================

URL="${1:-https://sri6ha.onrender.com}"
INTERVAL=840  # 14 minutes in seconds (Render sleeps after 15 min)

echo "==========================================="
echo "  🟢 Keep-Alive started"
echo "  URL      : $URL"
echo "  Interval : every $((INTERVAL / 60)) minutes"
echo "  Started  : $(date '+%Y-%m-%d %H:%M:%S')"
echo "==========================================="

while true; do
  TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 "$URL/api/keepalive")

  if [ "$HTTP_STATUS" = "200" ]; then
    echo "[$TIMESTAMP] ✅ Ping OK — $URL (HTTP $HTTP_STATUS)"
  else
    echo "[$TIMESTAMP] ⚠️  Ping failed — $URL (HTTP $HTTP_STATUS)"
  fi

  sleep "$INTERVAL"
done
