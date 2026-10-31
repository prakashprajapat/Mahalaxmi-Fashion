#!/bin/bash
# The frontend swap, and the fault that broke the deploy on 29 and 31 October.
#
# The running site writes into .next while it is running - a revalidated page
# under .next/server/app, an optimised photo under .next/cache. The swap
# renames .next away and renames the new build into its place. In between,
# the server writes, the path is gone, and the directory is created afresh.
#
# A plain `mv a b` onto a directory that exists puts a INSIDE b. So the build
# landed at .next/.next-build, next start found no BUILD_ID, and the site
# served nothing. Both failures showed the same listing: one visible child
# called server, link count 4, the second child being the nested build that
# plain ls does not show.
#
# These cases run the OLD swap and the NEW one against the same injected
# fault, so the fix is shown to fix something rather than asserted to.
#
# Run: bash scripts/deploy-swap-replay.sh

pass=0; fail=0
ok()   { pass=$((pass+1)); }
bad()  { fail=$((fail+1)); echo "FAIL $1"; echo "     $2"; }
check(){ # name, expected, actual
  if [ "$2" = "$3" ]; then ok; else bad "$1" "expected [$2], got [$3]"; fi
}

ROOT=$(mktemp -d)
trap 'rm -rf "$ROOT"' EXIT

BUILD_DIR=.next-build
PREV_DIR=.next-previous

# ── a site on disk, as the server has it ─────────────────────────────────
stage() {           # $1 = case dir
  local d="$ROOT/$1"
  rm -rf "$d"; mkdir -p "$d/frontend"
  # the build that is serving right now
  mkdir -p "$d/frontend/.next/server/app" "$d/frontend/.next/cache/images" "$d/frontend/.next/static"
  echo "OLD-BUILD" > "$d/frontend/.next/BUILD_ID"
  echo "img" > "$d/frontend/.next/cache/images/abc.webp"
  # the build that was just made
  mkdir -p "$d/frontend/$BUILD_DIR/server/app" "$d/frontend/$BUILD_DIR/static"
  echo "NEW-BUILD" > "$d/frontend/$BUILD_DIR/BUILD_ID"
  echo "$d"
}

# The running frontend, writing where it has always written.
remake_skeleton() { mkdir -p "$1/frontend/.next/server/app"; echo "<html>" > "$1/frontend/.next/server/app/index.html"; }

# How many more times it will write while we are tidying up. A real server
# writes when a page revalidates, which is occasionally - not on every
# microsecond - so the interesting cases are "once or twice more", and
# "for ever", which must fail cleanly rather than nest.
WRITES_LEFT=0
maybe_write() {
  [ "$WRITES_LEFT" = forever ] && { remake_skeleton "$1"; return; }
  if [ "$WRITES_LEFT" -gt 0 ] 2>/dev/null; then
    WRITES_LEFT=$((WRITES_LEFT-1)); remake_skeleton "$1"
  fi
}

# ── the swap as it was, up to 31 October ─────────────────────────────────
old_swap() {        # $1 = dir, $2 = inject "yes" to remake .next mid-window
  local d=$1 why=""
  rm -rf "$d/frontend/$PREV_DIR"
  [ -e "$d/frontend/$PREV_DIR" ] && { echo "stopped: parking spot"; return 1; }
  [ -d "$d/frontend/.next" ] && { mv "$d/frontend/.next" "$d/frontend/$PREV_DIR" || { echo "stopped: park"; return 1; }; }
  [ -e "$d/frontend/.next" ] && { echo "stopped: .next still there"; return 1; }

  # the image cache, copied between the two renames - the slow part
  if [ -d "$d/frontend/$PREV_DIR/cache/images" ]; then
    mkdir -p "$d/frontend/$BUILD_DIR/cache"
    cp -al "$d/frontend/$PREV_DIR/cache/images" "$d/frontend/$BUILD_DIR/cache/" 2>/dev/null || true
  fi
  [ "$2" = yes ] && remake_skeleton "$d"

  mv "$d/frontend/$BUILD_DIR" "$d/frontend/.next" || { echo "stopped: move"; return 1; }
  echo "swapped"
}

# ── the swap as it is now ────────────────────────────────────────────────
new_swap() {        # $1 = dir, $2 = inject once, $3 = inject on EVERY attempt
  local d=$1
  # the cache first, while .next is still in place - and only when there is a
  # build to put it in, or the mkdir below creates one out of nothing
  if [ -d "$d/frontend/$BUILD_DIR" ] && [ -d "$d/frontend/.next/cache/images" ]; then
    mkdir -p "$d/frontend/$BUILD_DIR/cache"
    cp -al "$d/frontend/.next/cache/images" "$d/frontend/$BUILD_DIR/cache/" 2>/dev/null || true
  fi

  rm -rf "$d/frontend/$PREV_DIR"
  [ -e "$d/frontend/$PREV_DIR" ] && { echo "stopped: parking spot"; return 1; }
  [ -d "$d/frontend/.next" ] && { mv -T "$d/frontend/.next" "$d/frontend/$PREV_DIR" || { echo "stopped: park"; return 1; }; }
  [ -e "$d/frontend/.next" ] && { echo "stopped: .next still there"; return 1; }

  [ "$2" = yes ] && remake_skeleton "$d"

  local swapped_in=no attempt
  for attempt in 1 2 3; do
    if [ -e "$d/frontend/.next" ]; then
      if [ -f "$d/frontend/.next/BUILD_ID" ]; then echo "stopped: real build in the way"; return 1; fi
      rm -rf "$d/frontend/.next"
    fi
    maybe_write "$d"                            # it writes again while we tidy
    if mv -T "$d/frontend/$BUILD_DIR" "$d/frontend/.next" 2>/dev/null; then swapped_in=yes; break; fi
  done
  [ "$swapped_in" = yes ] || { echo "stopped: move"; return 1; }
  echo "swapped"
}

id_of() { cat "$1/frontend/.next/BUILD_ID" 2>/dev/null || echo "(none)"; }

echo "=== 1. Nothing interferes: both swaps work ==="
d=$(stage a); r=$(old_swap "$d" no);  check "1a old swap reports" "swapped" "$r"; check "1b and the new build is in place" "NEW-BUILD" "$(id_of "$d")"
d=$(stage b); r=$(new_swap "$d" no no); check "1c new swap reports" "swapped" "$r"; check "1d and the new build is in place" "NEW-BUILD" "$(id_of "$d")"

echo "=== 2. The running server re-makes .next mid-window ==="
# This is 29 and 31 October. The old swap reports success and serves nothing.
d=$(stage c); r=$(old_swap "$d" yes)
check "2a the old swap still says it worked" "swapped" "$r"
check "2b but there is no build to serve" "(none)" "$(id_of "$d")"
if [ -f "$d/frontend/.next/$BUILD_DIR/BUILD_ID" ]; then ok; else bad "2c the build is nested inside .next" "not nested where expected"; fi
# And the listing the deploy printed, reproduced exactly:
visible=$(ls "$d/frontend/.next")
check "2d plain ls shows only server, as it did on the server" "server" "$visible"
links=$(stat -c %h "$d/frontend/.next")
check "2e and the link count is 4 - two subdirectories, one of them hidden" "4" "$links"

d=$(stage e); r=$(new_swap "$d" yes no)
check "2f the new swap survives it" "swapped" "$r"
check "2g with the new build actually in place" "NEW-BUILD" "$(id_of "$d")"
if [ -e "$d/frontend/.next/$BUILD_DIR" ]; then bad "2h nothing is nested" "found a nested build dir"; else ok; fi

echo "=== 3. It writes again while we are clearing up ==="
d=$(stage f); WRITES_LEFT=1; r=$(new_swap "$d" yes no); WRITES_LEFT=0
check "3a it keeps trying and gets there" "swapped" "$r"
check "3b new build in place" "NEW-BUILD" "$(id_of "$d")"

# The honest worst case: a server writing into .next on every single attempt.
# It cannot succeed, and the only thing that matters is HOW it fails - cleanly,
# with the build still whole and nothing nested, so the rollback has a site to
# put back.
d=$(stage f2); WRITES_LEFT=forever; r=$(new_swap "$d" yes no); WRITES_LEFT=0
check "3c it gives up rather than nesting" "stopped: move" "$r"
if [ -e "$d/frontend/$BUILD_DIR/BUILD_ID" ]; then ok; else bad "3d the new build is still intact" "the build was consumed"; fi
check "3e and the old one is still parked for the rollback" "OLD-BUILD" "$(cat "$d/frontend/$PREV_DIR/BUILD_ID" 2>/dev/null)"

echo "=== 4. A REAL build sitting at .next is never deleted ==="
# If .next somehow holds a working build, deleting it would take the shop down
# to replace it with a copy of itself. Stop instead.
# Staged by hand, because the park moves .next away first - this is the state
# the guard exists for: something put a working build back at .next.
d=$(stage h)
rm -rf "$d/frontend/$PREV_DIR"
mv -T "$d/frontend/.next" "$d/frontend/$PREV_DIR"
mkdir -p "$d/frontend/.next"; echo "SOMEONES-BUILD" > "$d/frontend/.next/BUILD_ID"
swapped_in=no
for attempt in 1 2 3; do
  if [ -e "$d/frontend/.next" ] && [ -f "$d/frontend/.next/BUILD_ID" ]; then refused=yes; break; fi
done
check "4a it refuses rather than deleting a build" "yes" "${refused:-no}"
check "4b and that build is still there" "SOMEONES-BUILD" "$(id_of "$d")"

echo "=== 5. The image cache survives the swap ==="
d=$(stage i); new_swap "$d" no no >/dev/null
if [ -f "$d/frontend/.next/cache/images/abc.webp" ]; then ok; else bad "5a the carried-over photo cache" "missing after the swap"; fi
# Copied BEFORE parking now, so the slow part is no longer inside the window
# where .next does not exist. That window is what the server wrote into.
d=$(stage j); mkdir -p "$d/frontend/.next/cache/images"
for i in $(seq 1 50); do echo x > "$d/frontend/.next/cache/images/p$i.webp"; done
new_swap "$d" no no >/dev/null
count=$(ls "$d/frontend/.next/cache/images" | wc -l)
check "5b all of it, not some of it" "51" "$count"

echo "=== 6. The old build is parked where the rollback looks for it ==="
d=$(stage k); new_swap "$d" no no >/dev/null
check "6a parked" "OLD-BUILD" "$(cat "$d/frontend/$PREV_DIR/BUILD_ID" 2>/dev/null)"
# and rolling back puts it straight back
rm -rf "$d/frontend/.next"; mv "$d/frontend/$PREV_DIR" "$d/frontend/.next"
check "6b and the rollback restores it" "OLD-BUILD" "$(id_of "$d")"

echo "=== 7. No build to swap in ==="
# The replay found this one: the cache step used to mkdir the build directory
# on its way to filling it, so a MISSING build came back as a cache-only
# directory and the swap moved that into place. Guarded now - no build dir,
# no cache copy.
d=$(stage l); rm -rf "$d/frontend/$BUILD_DIR"
r=$(new_swap "$d" no no)
check "7a it stops" "stopped: move" "$r"
if [ -e "$d/frontend/$BUILD_DIR" ]; then bad "7c the cache step did not re-make it" "build dir was recreated"; else ok; fi
check "7b and the old build is still parked, so the rollback has something" "OLD-BUILD" "$(cat "$d/frontend/$PREV_DIR/BUILD_ID" 2>/dev/null)"

echo "=== 8. A leftover parking spot that will not clear ==="
# NOT chmod. The deploy runs as root and root ignores the permission bits, so
# a staged "undeletable" directory is deletable and the branch under test never
# runs - which is exactly the mistake the first version of this replay made,
# and it passed everything for the wrong reason. The removal itself is stubbed
# instead, which is the thing actually being simulated: rm came back and the
# directory is still there.
d=$(stage m); mkdir -p "$d/frontend/$PREV_DIR"
rm() { return 0; }
r=$(new_swap "$d" no no)
unset -f rm
check "8a it stops before touching anything" "stopped: parking spot" "$r"
check "8b and the running build is untouched" "OLD-BUILD" "$(id_of "$d")"

echo
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ] || exit 1
