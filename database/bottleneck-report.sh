#!/usr/bin/env bash
# Where is this shop's bottleneck, actually?
#
#   bash database/bottleneck-report.sh
#
# Reads only. Safe any time, including under load.
#
# ─────────────────────────────────────────────────────────────────────────────
# Why this exists
#
# The famous scaling stories go: one server, then connection pooling, then read
# replicas, then splitting the heaviest table out, then sharding, then
# generating IDs that carry their own shard number. Every step is correct - for
# the shop that is at that step.
#
# This shop is at the first or second. Copying step five would mean rewriting
# every query to route by shard, for a database that fits in memory with room
# to spare. The whole lesson is the last line of it: find YOUR bottleneck
# before you go looking for a new database. This prints yours.
#
# Each section says what the number means and what would have to be true before
# the next step is worth anything.
# ─────────────────────────────────────────────────────────────────────────────
set -u

DB=${DB:-mahalaxmi_fashionhub}
PSQL_USER=${PSQL_USER:-postgres}

# Works whether Postgres runs in compose or directly on the host.
if docker compose ps postgres >/dev/null 2>&1 && [ -n "$(docker compose ps -q postgres 2>/dev/null)" ]; then
  q() { docker compose exec -T postgres psql -U "$PSQL_USER" -d "$DB" -X -q "$@"; }
else
  q() { psql -U "$PSQL_USER" -d "$DB" -X -q "$@"; }
fi

line() { printf '\n== %s %s\n' "$1" "$(printf '=%.0s' $(seq 1 $((66 - ${#1}))))"; }

line "THE MACHINE"
echo "If memory or disk is the wall, nothing about the database layout helps."
free -m 2>/dev/null | awk 'NR==1{print "        "$0} NR==2{print "        "$0}'
echo
df -h / 2>/dev/null | awk 'NR==1{print "        "$0} NR==2{print "        "$0}'
echo
echo "   Load average (1/5/15 min), against $(nproc 2>/dev/null || echo '?') CPU(s):"
echo "        $(cut -d' ' -f1-3 /proc/loadavg 2>/dev/null)"
echo
echo "   Load above the CPU count, sustained, means the machine is the bottleneck."

line "STAGE 2: CONNECTIONS"
echo "Postgres runs a separate PROCESS per connection and spends real memory on"
echo "each. This is the wall that comes before any of the clever ones."
q -c "
SELECT (SELECT setting::int FROM pg_settings WHERE name='max_connections')              AS ceiling,
       (SELECT setting::int FROM pg_settings WHERE name='superuser_reserved_connections') AS reserved,
       (SELECT count(*) FROM pg_stat_activity)                                           AS in_use_now,
       (SELECT count(*) FROM pg_stat_activity WHERE state='idle')                        AS idle,
       (SELECT count(*) FROM pg_stat_activity WHERE state='active')                      AS working;"
echo "   Who is holding them:"
q -c "
SELECT coalesce(application_name,'(none)') AS app, usename AS role, state, count(*)
FROM pg_stat_activity GROUP BY 1,2,3 ORDER BY count(*) DESC LIMIT 10;"
echo "   in_use_now creeping toward (ceiling - reserved) is when a pooler earns"
echo "   its keep. Until then it is one more thing that can break."

line "STAGE 3: ARE READS EVEN HITTING THE DISK?"
echo "A cache hit ratio near 100% means the working set already lives in memory,"
echo "and read replicas would be solving a problem that is not there."
q -c "
SELECT round(100.0 * sum(blks_hit) / nullif(sum(blks_hit) + sum(blks_read), 0), 2) AS cache_hit_pct,
       pg_size_pretty(sum(blks_read) * 8192::bigint) AS read_from_disk_ever
FROM pg_stat_database WHERE datname = current_database();"
echo "   Below ~95% and sustained: the data no longer fits in memory. That is"
echo "   the first honest signal for replicas or a bigger machine."
echo
echo "   Reads against writes, per table:"
q -c "
SELECT relname AS table_name,
       to_char(coalesce(seq_tup_read,0) + coalesce(idx_tup_fetch,0), 'FM999,999,999') AS rows_read,
       to_char(n_tup_ins + n_tup_upd + n_tup_del, 'FM999,999,999')                    AS rows_written
FROM pg_stat_user_tables
ORDER BY coalesce(seq_tup_read,0) + coalesce(idx_tup_fetch,0) DESC LIMIT 8;"

line "STAGE 4: HOW BIG IS ANY OF THIS?"
echo "The story's step four was one table outgrowing the largest machine money"
echo "could buy. Compare these to the RAM figure at the top."
q -c "
SELECT pg_size_pretty(pg_database_size(current_database())) AS whole_database;"
q -c "
SELECT relname AS table_name,
       pg_size_pretty(pg_total_relation_size(relid)) AS total,
       pg_size_pretty(pg_indexes_size(relid))        AS of_which_indexes,
       to_char(n_live_tup, 'FM999,999,999')          AS rows
FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 10;"
echo "   While the whole database fits in RAM several times over, splitting a"
echo "   table onto its own server moves work around rather than removing it."

line "WHAT IS ACTUALLY SLOW"
echo "The only section that can name a specific thing to fix."
if q -tAc "SELECT 1 FROM pg_extension WHERE extname='pg_stat_statements'" 2>/dev/null | grep -q 1; then
  q -c "
  SELECT round(mean_exec_time::numeric, 1) AS avg_ms,
         to_char(calls, 'FM999,999,999')   AS calls,
         round(total_exec_time::numeric / 1000, 1) AS total_sec,
         left(regexp_replace(query, '\s+', ' ', 'g'), 90) AS query
  FROM pg_stat_statements
  WHERE query NOT LIKE '%pg_stat%'
  ORDER BY total_exec_time DESC LIMIT 10;"
  echo "   Sort by total_sec, not avg_ms: a 2ms query run a million times costs"
  echo "   more than a 4-second one run twice."
else
  echo "   pg_stat_statements is not enabled, so nothing here can name the slow"
  echo "   query - and without it, any answer about what to fix is a guess."
  echo
  echo "   To turn it on (needs one restart):"
  echo "       ALTER SYSTEM SET shared_preload_libraries = 'pg_stat_statements';"
  echo "       -- restart Postgres, then:"
  echo "       CREATE EXTENSION pg_stat_statements;"
fi

line "TABLES READ END TO END"
echo "High seq_tup_read on a growing table is either a missing index or a query"
echo "written so that no index can be used - see database/explain-hot-queries.sql."
q -c "
SELECT relname AS table_name, seq_scan,
       to_char(seq_tup_read, 'FM999,999,999') AS rows_read_that_way,
       idx_scan AS index_lookups, n_live_tup AS rows_in_table
FROM pg_stat_user_tables WHERE seq_scan > 0
ORDER BY seq_tup_read DESC LIMIT 8;"

line "SO WHICH STEP IS THIS SHOP ON?"
cat <<'NOTE'
   Read the numbers above against these, in order. The first one that is true
   is the only one worth working on.

     The machine is out of memory or CPU         -> a bigger VPS. Cheapest fix
                                                    there is, and the first one.
     Connections near the ceiling                -> PgBouncer, or a smaller
                                                    pool per process first.
     Cache hit ratio falling below ~95%          -> the working set no longer
                                                    fits; more RAM, then caching
                                                    the hottest reads.
     One table far larger than the rest AND
       the database no longer fits in RAM        -> move that table to its own
                                                    server.
     A single machine cannot hold it at all      -> sharding, and only then do
                                                    IDs that carry their shard.

   Nothing above being true means the answer is none of them, and the honest
   next step is to leave the database alone.
NOTE
echo
