#!/bin/bash
echo "=== Deploying Mahalaxmi ==="
cd /var/www/mahalaxmi-nextjs

echo "1. Git pull..."
git pull origin main

echo "2. Building backend..."
cd backend && dotnet publish -c Release -o /var/www/mahalaxmi-backend && cd ..

echo "3. Restarting API (safe)..."
fuser -k 5000/tcp 2>/dev/null; sleep 3
pm2 restart mahalaxmi-api

echo "4. Building frontend..."
cd frontend && npm run build && cd ..
pm2 restart mahalaxmi-frontend

echo "5. Warming up API..."
sleep 10
curl -s http://localhost:5000/api/products?pageSize=1 > /dev/null && echo "API warm ✅"
pm2 status
echo "=== Deploy complete ==="
