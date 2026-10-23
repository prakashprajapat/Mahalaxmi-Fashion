#!/usr/bin/env bash
# Ask both API slots whether they are well, and move nginx off one that is not.
#
# Run it from cron, every minute:
#
#   * * * * * /var/www/mahalaxmi-nextjs/health-watch.sh >> /var/log/mfh-health.log 2>&1
#
# ─────────────────────────────────────────────────────────────────────────────
# Why this exists when nginx already has max_fails
#
# A load balancer does not notice a dead server by magic; it notices because
# something checks. nginx open-source checks PASSIVELY - it learns a server is
# gone by failing real requests at it. That works, and the cost is that the
# first few failures are real shoppers seeing an error. Active checking, where
# nginx polls /api/health on a timer and takes a server out before anybody
# meets it, is an nginx Plus feature.
#
# This is the free version of active checking. It asks each slot the same
# question /api/health answers - is the database reachable, is there disk left
# - and if the one nginx is pointed at says no while the other says yes, it
# moves the upstream and reloads. Detection and failover, which are two
# different jobs: this one detects, and the reload is what shifts the traffic.
#
# What it deliberately will NOT do:
#
#   Switch to a slot that is also unwell. Moving traffic from a broken server
#   to another broken server is motion, not a fix, and it loses the one clue
#   worth having - which half is actually broken.
#
#   Switch twice in a row quickly. A slot that is flapping - up, down, up -
#   would otherwise have nginx reloading every minute, and a reload while the
#   shop is already struggling is not help.
# ─────────────────────────────────────────────────────────────────────────────
set -u

UPSTREAM_CONF=/etc/nginx/conf.d/mfh-api-upstream.conf
STATE_FILE=/var/www/mfh-live-colour
LAST_SWITCH=/var/www/mfh-last-failover
COOLDOWN=300          # seconds; no second automatic switch inside this
PORT_blue=5001
PORT_green=5002

stamp() { date -u '+%Y-%m-%d %H:%M:%S UTC'; }
say()   { echo "$(stamp) $*"; }

[ -f "$UPSTREAM_CONF" ] || { say "blue/green is not set up; nothing to watch."; exit 0; }

port_of()     { [ "$1" = blue ] && echo $PORT_blue || echo $PORT_green; }
other_colour(){ [ "$1" = blue ] && echo green || echo blue; }

# Healthy means /api/health answered 200. It returns 503 when the database is
# unreachable or the disk is nearly full, which is the point: a process that
# is running but cannot serve is not healthy, and "the port is open" would
# have called it fine.
healthy() {
  curl -fs --max-time 4 "http://127.0.0.1:$1/api/health" >/dev/null 2>&1
}

LIVE=$(cat "$STATE_FILE" 2>/dev/null || echo blue)
STANDBY=$(other_colour "$LIVE")
LIVE_PORT=$(port_of "$LIVE")
STANDBY_PORT=$(port_of "$STANDBY")

if healthy "$LIVE_PORT"; then
  exit 0                      # the usual answer, and it says nothing
fi

# Once more before doing anything. A single missed check is a hiccup - a
# garbage collection pause, a slow query - and reloading nginx over one of
# those would make things worse rather than better.
sleep 3
if healthy "$LIVE_PORT"; then
  say "$LIVE missed one check and answered the next. Left alone."
  exit 0
fi

say "$LIVE (port $LIVE_PORT) is not answering /api/health."

if ! healthy "$STANDBY_PORT"; then
  say "$STANDBY is not answering either. NOT switching - that would move"
  say "traffic from one broken slot to another and lose the one useful clue."
  say "Look at: pm2 logs mfh-api-$LIVE   and whether Postgres is up."
  exit 1
fi

NOW=$(date +%s)
LAST=$(cat "$LAST_SWITCH" 2>/dev/null || echo 0)
if [ $((NOW - LAST)) -lt $COOLDOWN ]; then
  say "Switched $((NOW - LAST))s ago; holding off to avoid flapping."
  exit 1
fi

say "$STANDBY (port $STANDBY_PORT) is healthy. Moving nginx to it."

BACKUP=$(mktemp)
cp "$UPSTREAM_CONF" "$BACKUP" 2>/dev/null || true

cat > "$UPSTREAM_CONF" <<NGINX
upstream mfh_api {
    server 127.0.0.1:$STANDBY_PORT max_fails=3 fail_timeout=10s;
    server 127.0.0.1:$LIVE_PORT backup;
}
NGINX

if ! nginx -t >/dev/null 2>&1; then
  cp "$BACKUP" "$UPSTREAM_CONF" 2>/dev/null || true
  rm -f "$BACKUP"
  say "ERROR: nginx config is not valid. Put the old upstream back and did not reload."
  exit 1
fi
rm -f "$BACKUP"

nginx -s reload || { say "ERROR: nginx reload failed."; exit 1; }
echo "$STANDBY" > "$STATE_FILE"
echo "$NOW" > "$LAST_SWITCH"

say "Now serving from $STANDBY. $LIVE is still the backup if it recovers."
say "This was automatic - find out WHY $LIVE stopped before deploying again:"
say "    pm2 logs mfh-api-$LIVE --lines 100"
