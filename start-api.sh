#!/bin/bash
APP_DIR=/var/www/mahalaxmi-backend
fuser -k 5000/tcp 2>/dev/null || true
sleep 1
cd "$APP_DIR" || { echo "ERROR: $APP_DIR not found. Run /var/www/deploy.sh to build the backend." >&2; exit 1; }
exec ./MahalaxmiApi
