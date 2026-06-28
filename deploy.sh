#!/bin/bash
# Deploy Mahalaxmi Fashion Hub straight from GitHub.
# Usage on the server:  bash /var/www/mahalaxmi-nextjs/deploy.sh
echo "=== Deploy Mahalaxmi (from GitHub) ==="

APP=/var/www/mahalaxmi-nextjs
REPO=https://github.com/prakashprajapat/Mahalaxmi-Fashion.git
cd "$APP" || { echo "ERROR: $APP not found"; exit 1; }

echo "1. Backing up server-only files (secrets + uploaded images)..."
cp backend/appsettings.json /root/appsettings.backup.json 2>/dev/null || true
rm -rf /root/mfh-uploads-backup && mkdir -p /root/mfh-uploads-backup
cp -r frontend/public/product-images /root/mfh-uploads-backup/ 2>/dev/null || true

echo "2. Pulling latest code from GitHub..."
git remote set-url origin "$REPO" 2>/dev/null || git remote add origin "$REPO"
git fetch origin main || { echo "ERROR: git fetch failed"; exit 1; }
git reset --hard origin/main

echo "3. Restoring server-only files..."
cp /root/appsettings.backup.json backend/appsettings.json 2>/dev/null || true
cp -rn /root/mfh-uploads-backup/product-images/. frontend/public/product-images/ 2>/dev/null || true

echo "4. Building backend..."
cd backend && dotnet publish -c Release -o /var/www/mahalaxmi-backend || { echo "ERROR: backend build failed"; exit 1; }
cd ..

echo "5. Restarting API..."
fuser -k 5000/tcp 2>/dev/null; sleep 2
pm2 restart mahalaxmi-api

echo "6. Building frontend..."
cd frontend && npm run build && cd ..
pm2 restart mahalaxmi-frontend

echo "7. Warming up..."
sleep 8
curl -s http://localhost:5000/api/products?pageSize=1 > /dev/null && echo "API OK ✅" || echo "⚠ API not responding — check: pm2 logs mahalaxmi-api"
pm2 status
echo "=== Deploy complete ==="
