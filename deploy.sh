#!/bin/bash
# Deploy Mahalaxmi Fashion Hub straight from GitHub.
# Usage on the server:  bash /var/www/mahalaxmi-nextjs/deploy.sh
#
# Safety model, part one: BOTH the backend and the frontend are built BEFORE the
# running site is touched. If either build fails, we roll the code back to the
# previous commit and leave the currently-running site untouched — so a bad push
# can never take the site down.
#
# Safety model, part two — and this is the part that was missing: a build that
# SUCCEEDS and then does not work. The old script killed port 5000, restarted the
# API in place, and only then asked whether it was answering. So every deploy had
# a hole in it where the shop was down, and a deploy that went wrong was down for
# the hole PLUS a rebuild and another restart. With ads running, those are paid
# clicks landing on nothing.
#
# The API is now released beside the running one instead of on top of it. Two
# slots, blue and green, on two ports; the new version is published to whichever
# is idle, started, and asked for its health on its own port while the old one
# carries on serving. Only once it answers does nginx move across — a reload,
# which nginx does without dropping a connection — and the old slot is left
# running for a grace period, so going back is one more reload rather than
# another build.
#
#     bash deploy.sh              deploy
#     bash deploy.sh --rollback   put the previous slot back, in about a second
#
# This needs one piece of nginx setup, once. Until that is in place the script
# notices and falls back to the old restart-in-place path, so it keeps working
# either way; see RUNBOOK-PENDING.md.
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

  # The API half depends on which kind of deploy this was.
  #
  # Blue/green: there is nothing to undo. The previous version never stopped
  # serving, nginx was never moved, and the half-built slot is simply left
  # alone to be overwritten by the next attempt. Rebuilding anything here
  # would be touching a running shop to fix something that is not broken.
  if [ -n "${TARGET:-}" ]; then
    echo "    The API is untouched: ${LIVE:-the live slot} never stopped serving."
  else
    (cd backend && dotnet publish -c Release -o /var/www/mahalaxmi-backend) >/dev/null 2>&1 || true
    pm2 restart mahalaxmi-api >/dev/null 2>&1 || true
  fi

  if [ -d "frontend/$PREV_DIR" ]; then
    echo "    Restoring the previous frontend build."
    rm -rf frontend/.next
    mv "frontend/$PREV_DIR" frontend/.next
  fi
  pm2 reload mahalaxmi-frontend >/dev/null 2>&1 || pm2 restart mahalaxmi-frontend >/dev/null 2>&1 || true
  # Rollback kaamyab hota hai - site chalti rehti hai - isliye bahar se kuch
  # galat dikhta hi nahi, aur raat ko gire deploy ka subah tak kisi ko pata
  # nahi chalta. Ye nishan HealthWatchdogService agli jaanch par uthakar mail
  # kar deta hai, aur phir khud mita deta hai.
  MARKER_DIR=/var/www/mahalaxmi-backend
  if [ -n "${LIVE:-}" ] && [ -d "/var/www/mahalaxmi-backend-$LIVE" ]; then
    MARKER_DIR="/var/www/mahalaxmi-backend-$LIVE"
  fi
  printf '%s\n' "Deploy $(date -u '+%Y-%m-%d %H:%M UTC') par fail hua aur $PREV par rollback ho gaya. Wajah: $1" \
    > "$MARKER_DIR/DEPLOY-FAILED" 2>/dev/null || true
  echo "=== Deploy aborted. The site is back on the previous version. ==="
  echo "=== Fix the error and push again. ==="
  exit 1
}

# Where this deploy's frontend build is written, and where the one now serving
# is parked while the swap happens.
BUILD_DIR=.next-build
PREV_DIR=.next-previous

# ── Blue/green slots for the API ─────────────────────────────────────────────
UPSTREAM_CONF=/etc/nginx/conf.d/mfh-api-upstream.conf
STATE_FILE=/var/www/mfh-live-colour
PORT_blue=5001
PORT_green=5002

# Is the nginx side set up? Both halves have to be there: the include file we
# rewrite, and a live config that actually proxies to the upstream it defines.
# Checking only the file would let a half-finished setup send the switch into
# a config nothing reads, and the deploy would report success over an API that
# no request reaches.
bluegreen_ready() {
  [ -f "$UPSTREAM_CONF" ] || return 1
  nginx -T 2>/dev/null | grep -q "proxy_pass http://mfh_api" || return 1
  return 0
}

live_colour() {
  if [ -f "$STATE_FILE" ]; then cat "$STATE_FILE"; return; fi
  # No state file yet: read it out of the upstream nginx is using.
  if grep -q ":$PORT_green" "$UPSTREAM_CONF" 2>/dev/null; then echo green; else echo blue; fi
}

other_colour() { [ "$1" = blue ] && echo green || echo blue; }
port_of() { [ "$1" = blue ] && echo $PORT_blue || echo $PORT_green; }

# Ask a slot, on its own port, whether it is actually working - before any
# traffic is sent to it. /api/health is the shallow one (is it up); the
# products call proves the database path end to end, which is what a boot that
# cannot reach Postgres fails at. Up to 60 seconds: a cold .NET start plus the
# schema check takes a few.
slot_healthy() {
  local port=$1 i
  for i in $(seq 1 20); do
    if curl -fs --max-time 5 "http://127.0.0.1:$port/api/health" >/dev/null 2>&1 \
       && curl -fs --max-time 8 "http://127.0.0.1:$port/api/products?pageSize=1" >/dev/null 2>&1; then
      return 0
    fi
    sleep 3
  done
  return 1
}

# Point nginx at a colour. The reload is graceful: nginx starts new workers on
# the new config and lets the old ones finish the requests they are holding, so
# nothing in flight is dropped. nginx -t first, because a reload on a broken
# config is the one way this step could take the site down.
point_nginx_at() {
  local colour=$1 port
  port=$(port_of "$colour")
  printf 'upstream mfh_api { server 127.0.0.1:%s; }\n' "$port" > "$UPSTREAM_CONF"
  nginx -t >/dev/null 2>&1 || { echo "   ERROR: nginx config is not valid; not reloading."; return 1; }
  nginx -s reload || return 1
  echo "$colour" > "$STATE_FILE"
  return 0
}

# --rollback: put the previous colour back. No build, no publish - the slot is
# still there and still running, so this is a file write and a reload.
if [ "${1:-}" = "--rollback" ]; then
  bluegreen_ready || { echo "Blue/green is not set up, so there is no slot to go back to."; exit 1; }
  NOW=$(live_colour); BACK=$(other_colour "$NOW")
  echo "Live is $NOW. Going back to $BACK."
  pm2 describe "mfh-api-$BACK" >/dev/null 2>&1 || { echo "ERROR: mfh-api-$BACK is not there."; exit 1; }
  pm2 start "mfh-api-$BACK" >/dev/null 2>&1 || true
  slot_healthy "$(port_of "$BACK")" || { echo "ERROR: $BACK is not answering. Not switching to it."; exit 1; }
  point_nginx_at "$BACK" || { echo "ERROR: could not switch nginx."; exit 1; }
  echo "Back on $BACK. $NOW is still running; stop it when you are satisfied:"
  echo "   pm2 stop mfh-api-$NOW"
  exit 0
fi

echo "4. Building backend..."
if bluegreen_ready; then
  LIVE=$(live_colour); TARGET=$(other_colour "$LIVE"); TARGET_PORT=$(port_of "$TARGET")
  echo "   Live slot: $LIVE. Building into the idle one: $TARGET (port $TARGET_PORT)."
  BACKEND_OUT=/var/www/mahalaxmi-backend-$TARGET
else
  echo "   NOTE: blue/green is not set up yet, so this is a restart-in-place deploy"
  echo "         with a short outage. See RUNBOOK-PENDING.md to set it up once."
  LIVE=""; TARGET=""; TARGET_PORT=5000
  BACKEND_OUT=/var/www/mahalaxmi-backend
fi
(cd backend && dotnet publish -c Release -o "$BACKEND_OUT") || rollback "Backend build failed."

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

# Both builds succeeded — now it's safe to release.
if [ -n "$TARGET" ]; then
  echo "7. Starting the new API beside the running one..."
  # Each slot binds its OWN port and nothing else, so starting this one cannot
  # disturb the one serving. No fuser here on purpose: killing a port is what
  # made the old deploy an outage.
  if pm2 describe "mfh-api-$TARGET" >/dev/null 2>&1; then
    pm2 restart "mfh-api-$TARGET" --update-env
  else
    ASPNETCORE_URLS="http://127.0.0.1:$TARGET_PORT" \
      pm2 start "/var/www/mahalaxmi-backend-$TARGET/MahalaxmiApi" \
        --name "mfh-api-$TARGET" --cwd "/var/www/mahalaxmi-backend-$TARGET"
  fi
  echo "   Waiting for $TARGET to answer on its own port before sending it anything..."
  slot_healthy "$TARGET_PORT" || {
    pm2 stop "mfh-api-$TARGET" >/dev/null 2>&1 || true
    rollback "The new API did not come up. Nothing was switched - the shop is still on $LIVE."
  }
  echo "   $TARGET is healthy."

  echo "   Moving nginx to $TARGET..."
  point_nginx_at "$TARGET" || {
    pm2 stop "mfh-api-$TARGET" >/dev/null 2>&1 || true
    rollback "Could not move nginx. Nothing was switched - the shop is still on $LIVE."
  }

  # Through nginx this time, which is the path a real shopper takes.
  curl -fs --max-time 8 "http://127.0.0.1/api/health" >/dev/null 2>&1 \
    || curl -fs --max-time 8 "http://127.0.0.1:$TARGET_PORT/api/health" >/dev/null 2>&1 \
    || { point_nginx_at "$LIVE"; rollback "The new API stopped answering through nginx; put $LIVE back."; }
  echo "   Switched. $LIVE is still running as the way back."
else
  echo "7. Restarting API (in place — short outage)..."
  fuser -k 5000/tcp 2>/dev/null; sleep 2
  pm2 restart mahalaxmi-api
fi

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

# reload, not restart. In cluster mode pm2 replaces the workers one at a time,
# so the port is never unserved; restart stops the site and then starts it. In
# fork mode reload behaves as restart, so this is never worse - and the note
# below says what to do about that once.
pm2 reload mahalaxmi-frontend --update-env || pm2 restart mahalaxmi-frontend
if ! pm2 jlist 2>/dev/null | grep -q '"name":"mahalaxmi-frontend"[^}]*"exec_mode":"cluster_mode"'; then
  echo "   NOTE: the frontend is in fork mode, so that reload was a restart with a"
  echo "         second or two of downtime. Cluster mode makes it seamless; see"
  echo "         RUNBOOK-PENDING.md."
fi


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
    | sed 's|^/*|/|' | sort -u > "$URLS"
  ORIGIN="${SITE_ORIGIN:-https://www.mahalaxmifashionhub.com}"

  # ---- 1. Cloudflare ka kinara (edge) -- product panne ki badi photo ----
  #
  # 3b083df ke baad product panne ki pehli photo optimiser se nahi jaati
  # (unoptimized). Browser sidha /product-images/xxx.webp maangta hai, aur wo
  # Cloudflare se hokar aata hai. Live product par naapa gaya:
  #     Cloudflare MISS  1393 ms
  #     Cloudflare HIT    390 ms
  # Yahi ek second ka farak wo dhundhlapan hai jo dukan rozana dekh rahi thi --
  # aur purane products par bhi, kyunki jis photo ko aaj tak kisi ne khola hi
  # nahi, uska kinara thanda pada hai. 2157f0b ne yeh sirf naye save hue
  # product ke liye theek kiya tha; purane products ke liye jagah yahi hai.
  #
  # Isko localhost se garam nahi kiya ja sakta -- cache VPS par nahi, Cloudflare
  # par hai. Isliye asli pate se maanga jata hai. Yeh pehle, kyunki shopper ki
  # aankh isi par hai, aur yeh sirf network hai, VPS ka CPU nahi khata.
  EDGE=$(mktemp)
  while read -r img; do echo "$ORIGIN$img" >> "$EDGE"; done < "$URLS"
  # Pehli photo par jaanch lo ki request waqai Cloudflare se guzri hai. Agar is
  # machine par DNS/hosts domain ko khud par lauta deta hai to yeh header nahi
  # aayega -- tab chup-chaap 400 bekaar request bhejne se behtar hai bata dena.
  CF=$(curl -s -o /dev/null -D - --max-time 30 -H "Accept: $ACCEPT" "$(head -1 "$EDGE")" \
        | tr -d '\r' | grep -i '^cf-cache-status:' | head -1 | awk '{print $2}')
  if [ -n "$CF" ]; then
    xargs -P 2 -n 1 curl -s -o /dev/null --max-time 30 -H "Accept: $ACCEPT" < "$EDGE"
    echo "   Cloudflare edge warmed ($(wc -l < "$EDGE") photos; pehli par $CF)."
  else
    echo "   NOTE: $ORIGIN se cf-cache-status header nahi mila - yeh request"
    echo "         Cloudflare tak nahi gayi. Badi photo ka kinara garam nahi hua."
  fi
  rm -f "$EDGE"

  # ---- 2. VPS ka optimiser -- suchi ke cards aur thumbnails ----
  # The url= has to be the ABSOLUTE address, because that is what the browser
  # asks for and the cache is keyed on it.
  #
  # This was warming url=%2Fproduct-images%2F... - the relative path. But
  # lib/productImages.ts turns every product photo into the full
  # https://www.mahalaxmifashionhub.com/... address before handing it to
  # next/image (deliberately: the optimiser cannot see a file uploaded after
  # the server started, so it fetches over HTTP from nginx instead). Two
  # different strings, two different cache entries. Every size warmed here
  # went into an entry nothing ever asked for, and every real visitor still
  # waited for the resize - which is the blurred photo the shop kept
  # reporting, on old products as well as new.
  # Kinara garam karna sirf network hai, isliye upar poori suchi jaati hai.
  # Resize VPS ka CPU khata hai, isliye yahan pehli 400 par hi rukte hain.
  head -400 "$URLS" | while read -r img; do
    enc=$(printf %s "$ORIGIN$img" | sed 's|:|%3A|g; s|/|%2F|g')
    for w in 384 640 828 1080; do
      echo "http://localhost:3000/_next/image?url=$enc&w=$w&q=75" >> "$REQS"
    done
  done
  # Do ek saath. Isse zyada par deploy ke turant baad VPS ka CPU asli
  # shoppers se chhin jata hai.
  xargs -P 2 -n 1 curl -s -o /dev/null --max-time 30 -H "Accept: $ACCEPT" < "$REQS"
  echo "   Optimiser cache warmed ($(( $(wc -l < "$REQS") / 4 )) photos, $(wc -l < "$REQS") sizes)."
  rm -f "$URLS" "$REQS"
) &
WARM_PID=$!
# Never let warming hold up or fail a deploy.
( sleep 600 && kill $WARM_PID 2>/dev/null ) >/dev/null 2>&1 &
pm2 status
echo "=== Deploy complete ==="
if [ -n "${TARGET:-}" ]; then
  echo
  echo "Live: mfh-api-$TARGET.  Still running as the way back: mfh-api-$LIVE."
  echo "To go back:  bash deploy.sh --rollback    (about a second, no build)"
  echo
  echo "The old slot is left running ON PURPOSE - that is what makes going back"
  echo "instant. It costs one idle .NET process worth of memory until the next"
  echo "deploy reuses that slot. If the VPS is tight:  pm2 stop mfh-api-$LIVE"
fi
