-- Which of the shop's busiest queries use an index, and which read the whole
-- table. Run on the VPS, against the real data:
--
--   docker compose exec -T postgres \
--     psql -U postgres -d mahalaxmi_fashionhub -f database/explain-hot-queries.sql
--
--   ...or, if Postgres is installed directly:
--   psql -U postgres -d mahalaxmi_fashionhub -f database/explain-hot-queries.sql
--
-- Safe to run any time: it reads, and EXPLAIN without ANALYZE does not even
-- execute the queries.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- How to read it
--
--   Index Scan / Index Only Scan / Bitmap Index Scan  -> good, it jumped
--   Seq Scan                                          -> it read every row
--
-- A Seq Scan is not automatically wrong. On a table of two hundred rows it is
-- FASTER than an index, and Postgres knows that, so a small table will show
-- Seq Scan no matter how many indexes it has. What matters is whether the plan
-- would still be a Seq Scan at a hundred thousand rows - which is what the
-- forced run at the bottom of each section shows.
-- ─────────────────────────────────────────────────────────────────────────────

\echo '=============================================================='
\echo 'How big are the tables? A plan only means something next to this'
\echo '=============================================================='
SELECT relname AS table_name,
       to_char(n_live_tup, 'FM999,999,999') AS rows
FROM pg_stat_user_tables
WHERE relname IN ('customers','site_orders','products','otp_tokens','refresh_tokens','reviews','wallet_transactions')
ORDER BY n_live_tup DESC;

\echo ''
\echo '=============================================================='
\echo '1. Sign in by email  (CustomersController.Login)'
\echo '=============================================================='
EXPLAIN SELECT * FROM customers WHERE email = 'someone@example.com';

\echo ''
\echo '--- the same, with Postgres told to prefer an index if it can ---'
\echo '--- (this is the plan it would pick once the table is big)     ---'
SET enable_seqscan = off;
EXPLAIN SELECT * FROM customers WHERE email = 'someone@example.com';
SET enable_seqscan = on;

\echo ''
\echo '=============================================================='
\echo '2. Sign in by mobile  (FindCustomerByIdentifier)'
\echo '=============================================================='
\echo '--- the OLD way: EndsWith -> LIKE %number. No index can serve this. ---'
SET enable_seqscan = off;
EXPLAIN SELECT * FROM customers WHERE phone LIKE '%9352460180';
\echo ''
\echo '--- the NEW way: equality on the generated column ---'
EXPLAIN SELECT * FROM customers WHERE phone10 = '9352460180';
SET enable_seqscan = on;

\echo ''
\echo '=============================================================='
\echo '3. One order by its number, and by its waybill'
\echo '=============================================================='
SET enable_seqscan = off;
EXPLAIN SELECT * FROM site_orders WHERE order_id = 'MFH17926468190317122';
EXPLAIN SELECT * FROM site_orders WHERE awb = '55746510000556';
SET enable_seqscan = on;

\echo ''
\echo '=============================================================='
\echo '4. The orders list: newest first, filtered by status'
\echo '=============================================================='
SET enable_seqscan = off;
EXPLAIN SELECT * FROM site_orders WHERE status = 'Pending' ORDER BY placed_at DESC LIMIT 50;
SET enable_seqscan = on;

\echo ''
\echo '=============================================================='
\echo '5. Checking a one-time code  (verify-otp)'
\echo '=============================================================='
SET enable_seqscan = off;
EXPLAIN SELECT * FROM otp_tokens
 WHERE phone = '9352460180' AND used = false AND expires_at > NOW()
 ORDER BY created_at DESC LIMIT 1;
SET enable_seqscan = on;

\echo ''
\echo '=============================================================='
\echo '6. Staying signed in  (POST /auth/refresh, once per 15 minutes'
\echo '   for every open tab - the most frequent indexed read here)'
\echo '=============================================================='
SET enable_seqscan = off;
EXPLAIN SELECT * FROM refresh_tokens WHERE token_hash = 'abc';
SET enable_seqscan = on;

\echo ''
\echo '=============================================================='
\echo 'Indexes Postgres has NEVER used'
\echo '=============================================================='
\echo 'Every one of these is kept up to date on every insert and update and'
\echo 'has returned nothing for it. Before dropping one, check the counter has'
\echo 'been running a while (pg_stat_reset would have zeroed it) and that it is'
\echo 'not there for a rule rather than a query - a UNIQUE index is doing its'
\echo 'job even with zero scans.'
SELECT s.relname    AS table_name,
       s.indexrelname AS index_name,
       s.idx_scan   AS times_used,
       pg_size_pretty(pg_relation_size(s.indexrelid)) AS size,
       CASE WHEN i.indisunique THEN 'UNIQUE - enforces a rule, keep' ELSE '' END AS note
FROM pg_stat_user_indexes s
JOIN pg_index i ON i.indexrelid = s.indexrelid
WHERE s.idx_scan = 0
  AND NOT i.indisprimary
ORDER BY pg_relation_size(s.indexrelid) DESC;

\echo ''
\echo '=============================================================='
\echo 'The ten indexes that ARE earning their keep'
\echo '=============================================================='
SELECT relname AS table_name, indexrelname AS index_name,
       to_char(idx_scan, 'FM999,999,999') AS times_used
FROM pg_stat_user_indexes
WHERE idx_scan > 0
ORDER BY idx_scan DESC
LIMIT 10;

\echo ''
\echo '=============================================================='
\echo 'Tables being read end to end the most'
\echo '=============================================================='
\echo 'seq_scan high with rows high is where the next index belongs - and'
\echo 'where to look for a query written so that no index can be used.'
SELECT relname AS table_name,
       seq_scan, to_char(seq_tup_read, 'FM999,999,999') AS rows_read_that_way,
       idx_scan AS index_lookups,
       n_live_tup AS rows_in_table
FROM pg_stat_user_tables
WHERE seq_scan > 0
ORDER BY seq_tup_read DESC
LIMIT 10;
