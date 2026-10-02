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

# pg_dump is how the nightly backup copies the database into your inbox.
command -v pg_dump >/dev/null 2>&1 || { echo "Installing postgresql-client (one-time, for nightly backups)..."; apt-get update -y && apt-get install -y postgresql-client; }

echo "1. Backing up server-only files (secrets + uploaded images)..."
cp backend/appsettings.json /root/appsettings.backup.json 2>/dev/null || true
rm -rf /root/mfh-uploads-backup && mkdir -p /root/mfh-uploads-backup
cp -r frontend/public/product-images /root/mfh-uploads-backup/ 2>/dev/null || true

echo "2. Pulling latest code from GitHub..."
git remote set-url origin "$REPO" 2>/dev/null || git remote add origin "$REPO"
git fetch origin main || { echo "ERROR: git fetch failed"; exit 1; }
PREV=$(git rev-parse HEAD)   # remember current commit so we can roll back on a failed build
echo "   Current commit: $PREV  (rollback target if the build fails)"

# git reset --hard throws away every change made on this machine. Two of them
# are known and copied back below; anything else edited here in an emergency —
# a hotfix typed at 11pm, a config touched to get the site up — vanished without
# a word. Now it is put in a dated archive first and the fact is said out loud,
# so a deploy can still never be the reason something was lost.
DIRTY=$(git status --porcelain --untracked-files=no)
if [ -n "$DIRTY" ]; then
  KEEP="/root/mfh-preserved-$(date +%Y%m%d-%H%M%S).tar.gz"
  echo "   !! Files changed on this server are about to be overwritten:"
  echo "$DIRTY" | sed 's/^/      /'
  git diff --name-only HEAD | tar -czf "$KEEP" -T - 2>/dev/null \
    && echo "   Saved a copy first: $KEEP" \
    || echo "   WARNING: could not archive them — continuing anyway."
fi

git reset --hard origin/main

echo "3. Restoring server-only files..."
cp /root/appsettings.backup.json backend/appsettings.json 2>/dev/null || true
cp -rn /root/mfh-uploads-backup/product-images/. frontend/public/product-images/ 2>/dev/null || true

# Helper: put everything back the way it was.
#
# It used to rebuild only the backend. If the FRONTEND build failed it left the
# new code checked out and the half-written build in place, and restarted
# nothing — so "no downtime" held for a backend failure and not for a frontend
# one. Now the previous build is kept on disk and put back, and whatever was
# already restarted is restarted again on the old code.
rollback() {
  echo "!!! $1"
  echo "    Rolling back to $PREV — the site goes on running the previous version."
  rm -rf frontend/$BUILD_DIR
  git reset --hard "$PREV"
  cp /root/appsettings.backup.json backend/appsettings.json 2>/dev/null || true
  (cd backend && dotnet publish -c Release -o /var/www/mahalaxmi-backend) >/dev/null 2>&1 || true
  if [ -d "frontend/$PREV_DIR" ]; then
    echo "    Restoring the previous frontend build."
    rm -rf frontend/.next
    mv "frontend/$PREV_DIR" frontend/.next
  fi
  pm2 restart mahalaxmi-api >/dev/null 2>&1 || true
  pm2 restart mahalaxmi-frontend >/dev/null 2>&1 || true
  echo "=== Deploy aborted. The site is back on the previous version. ==="
  echo "=== Fix the error and push again. ==="
  exit 1
}

# Where this deploy's frontend build is written, and where the one now serving
# is parked while the swap happens.
BUILD_DIR=.next-build
PREV_DIR=.next-previous

echo "4. Building backend..."
(cd backend && dotnet publish -c Release -o /var/www/mahalaxmi-backend) || rollback "Backend build failed."

echo "5. Checking frontend dependencies..."
# next/image resizes every product photo on the server, and it cannot do that
# without sharp. This script has never run npm install, so a newly added
# dependency would otherwise be missing here and every photo would 500.
# Installed once, then skipped on later deploys.
if ! (cd frontend && node -e "require('sharp')" >/dev/null 2>&1); then
  echo "   Installing sharp (one-time, needed for image resizing)..."
  # --no-package-lock: this project has never had a lockfile, and the one npm
  # writes here lists no platform SWC binaries, so every later build prints
  # "Found lockfile missing swc dependencies, patching..." and then fails to
  # patch it because pnpm is not installed. Harmless, but it looks like a
  # broken build in the log. If a stray one is already on the server, delete
  # it once: rm frontend/package-lock.json
  (cd frontend && npm install --no-audit --no-fund --no-package-lock sharp@^0.33.5) \
    || rollback "sharp install failed — photos would not render."
  (cd frontend && node -e "require('sharp')" >/dev/null 2>&1) \
    || rollback "sharp installed but will not load on this machine."
  echo "   sharp OK"
else
  echo "   sharp already present"
fi

echo "6. Building frontend (into $BUILD_DIR — the live site keeps serving .next)..."
rm -rf "frontend/$BUILD_DIR"
(cd frontend && NEXT_DIST_DIR=$BUILD_DIR npm run build) || rollback "Frontend build failed."
[ -f "frontend/$BUILD_DIR/BUILD_ID" ] || rollback "Frontend build produced no BUILD_ID."

# Both builds succeeded — now it's safe to restart the live processes.
echo "7. Restarting API..."
fuser -k 5000/tcp 2>/dev/null; sleep 2
pm2 restart mahalaxmi-api

echo "8. Swapping in the new frontend and restarting..."
# Two renames on the same filesystem: the window where .next is not the
# finished build is a fraction of a second, against the two or three minutes
# the old in-place build left it broken for.
rm -rf "frontend/$PREV_DIR"
[ -d frontend/.next ] && mv frontend/.next "frontend/$PREV_DIR"

# Banayi hui photo ko nayi build me saath le jate hain.
#
# Optimiser har photo ko pehli maang par banata hai aur .next/cache/images me
# rakh leta hai — tees din ke liye. Par .next hi har deploy par badal jati
# thi, to woh poora khazana har baar mit jata tha aur sab kuch phir se thanda.
# Jitni baar deploy, utni baar pehla shopper intezar karta tha.
#
# Files ke naam me unka hash hai, isliye purani entry naye build me bhi utni
# hi sahi hai. Hardlink se jodte hain — turant, aur disk bhi dugni nahi hoti;
# na jude to seedhi nakal.
if [ -d "frontend/$PREV_DIR/cache/images" ]; then
  mkdir -p "frontend/$BUILD_DIR/cache"
  cp -al "frontend/$PREV_DIR/cache/images" "frontend/$BUILD_DIR/cache/" 2>/dev/null \
    || cp -a "frontend/$PREV_DIR/cache/images" "frontend/$BUILD_DIR/cache/" 2>/dev/null \
    || true
  echo "   Image cache carried over."
fi

mv "frontend/$BUILD_DIR" frontend/.next
pm2 restart mahalaxmi-frontend


echo "9. Health check..."
sleep 8

# These used to print a warning and carry on, which meant a deploy could
# announce "complete" over a site that was answering nothing. A check whose
# failure changes nothing is not a check.
API_OK=""
for _ in 1 2 3 4 5 6; do
  if curl -fs --max-time 5 "http://localhost:5000/api/products?pageSize=1" >/dev/null; then API_OK=1; break; fi
  sleep 5
done
[ -n "$API_OK" ] && echo "   API OK" || rollback "API is not answering after the restart."

WEB_OK=""
for _ in 1 2 3 4 5 6; do
  if curl -fs --max-time 10 -o /dev/null "http://localhost:3000/"; then WEB_OK=1; break; fi
  sleep 5
done
[ -n "$WEB_OK" ] && echo "   Website OK" || rollback "The website is not answering after the restart."

echo "   Warming up..."

# The image optimiser resizes each photo the first time someone asks for it,
# which costs a few hundred milliseconds. Left alone, the first real visitor
# after a deploy pays that for every photo on the page and watches the cards
# fill in one by one. Asking for them here means the cache is already warm.
echo "   Warming the image cache..."
#
# Pehle yahan sirf "image" wali photo, sirf 384 aur 640 par garam hoti thi.
# Wo card ki chaudai hai. Product ke panne ki badi photo (foan par 1080) kabhi
# pehle se banti hi nahi thi — isliye suchi me sab saaf dikhta tha aur product
# kholte hi paanch second dhundhla dhabba. Jin products ki photo
# productPhotos.front me hai, unki to "image" wali kunji bhi nahi padhi jati
# thi, yani wo bilkul achhuti rehti thi.
#
# Ab jawab me jo bhi /product-images/... ka naam dikhe, chaahe kisi bhi kunji
# ke neeche, woh uthaya jata hai — aur un sab chaudaiyon par jo asli browser
# maangta hai (next.config.js ki deviceSizes).
(
  ACCEPT='image/webp,*/*'
  URLS=$(mktemp); REQS=$(mktemp)
  curl -s "http://localhost:5000/api/products?pageSize=500" \
    | grep -oE '/?product-images/[A-Za-z0-9._%-]+\.(webp|jpg|jpeg|png|avif|gif)' \
    | sed 's|^/*|/|' | sort -u | head -400 > "$URLS"
  while read -r img; do
    enc=$(printf %s "$img" | sed 's|/|%2F|g')
    for w in 384 640 828 1080; do
      echo "http://localhost:3000/_next/image?url=$enc&w=$w&q=75" >> "$REQS"
    done
  done < "$URLS"
  # Do ek saath. Isse zyada par deploy ke turant baad VPS ka CPU asli
  # shoppers se chhin jata hai.
  xargs -P 2 -n 1 curl -s -o /dev/null --max-time 30 -H "Accept: $ACCEPT" < "$REQS"
  echo "   Image cache warmed ($(wc -l < "$URLS") photos, $(wc -l < "$REQS") sizes)."
  rm -f "$URLS" "$REQS"
) &
WARM_PID=$!
# Never let warming hold up or fail a deploy.
( sleep 420 && kill $WARM_PID 2>/dev/null ) >/dev/null 2>&1 &
pm2 status
echo "=== Deploy complete ==="
