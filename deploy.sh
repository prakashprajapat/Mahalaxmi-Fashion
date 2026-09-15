#!/bin/bash
# Deploy Mahalaxmi Fashion Hub straight from GitHub.
# Usage on the server:  bash /var/www/mahalaxmi-nextjs/deploy.sh
#
# Safety model: BOTH the backend and the frontend are built BEFORE the running
# site is touched. If either build fails, we roll the code back to the previous
# commit and leave the currently-running site untouched — so a bad push can never
# take the site down.
set -u
echo "=== Deploy Mahalaxmi (from GitHub) ==="

APP=/var/www/mahalaxmi-nextjs
REPO=https://github.com/prakashprajapat/Mahalaxmi-Fashion.git
cd "$APP" || { echo "ERROR: $APP not found"; exit 1; }

# ffmpeg is required for server-side return-video compression (installed once).
command -v ffmpeg >/dev/null 2>&1 || { echo "Installing ffmpeg (one-time)..."; apt-get update -y && apt-get install -y ffmpeg; }

echo "1. Backing up server-only files (secrets + uploaded images)..."
cp backend/appsettings.json /root/appsettings.backup.json 2>/dev/null || true
rm -rf /root/mfh-uploads-backup && mkdir -p /root/mfh-uploads-backup
cp -r frontend/public/product-images /root/mfh-uploads-backup/ 2>/dev/null || true

echo "2. Pulling latest code from GitHub..."
git remote set-url origin "$REPO" 2>/dev/null || git remote add origin "$REPO"
git fetch origin main || { echo "ERROR: git fetch failed"; exit 1; }
PREV=$(git rev-parse HEAD)   # remember current commit so we can roll back on a failed build
echo "   Current commit: $PREV  (rollback target if the build fails)"
git reset --hard origin/main

echo "3. Restoring server-only files..."
cp /root/appsettings.backup.json backend/appsettings.json 2>/dev/null || true
cp -rn /root/mfh-uploads-backup/product-images/. frontend/public/product-images/ 2>/dev/null || true

# Helper: roll code back to the previous commit, restore secrets, rebuild backend to that
# commit so the publish dir matches the running (old) site, then abort WITHOUT restarting.
rollback() {
  echo "!!! $1"
  echo "    Rolling back to $PREV — the site keeps running the previous version."
  git reset --hard "$PREV"
  cp /root/appsettings.backup.json backend/appsettings.json 2>/dev/null || true
  (cd backend && dotnet publish -c Release -o /var/www/mahalaxmi-backend) >/dev/null 2>&1 || true
  echo "=== Deploy aborted (no downtime). Fix the error and push again. ==="
  exit 1
}

echo "4. Building backend..."
(cd backend && dotnet publish -c Release -o /var/www/mahalaxmi-backend) || rollback "Backend build failed."

echo "5. Building frontend..."
(cd frontend && npm run build) || rollback "Frontend build failed."

# Both builds succeeded — now it's safe to restart the live processes.
echo "6. Restarting API..."
fuser -k 5000/tcp 2>/dev/null; sleep 2
pm2 restart mahalaxmi-api

echo "7. Restarting frontend..."
pm2 restart mahalaxmi-frontend

echo "8. Warming up..."
sleep 8
curl -s http://localhost:5000/api/products?pageSize=1 > /dev/null && echo "API OK ✅" || echo "⚠ API not responding — check: pm2 logs mahalaxmi-api"
pm2 status
echo "=== Deploy complete ==="
