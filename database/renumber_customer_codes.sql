-- ============================================================
--  One-time migration: renumber ALL existing customers to
--  MFHCUS1005, MFHCUS1006, ... (in the order they joined),
--  and set up a sequence so future codes continue from there
--  and are NEVER reused, even after a customer is deleted.
--
--  Safe to run once on the live database (mahalaxmi_fashionhub).
--  customer_code is only a display code (not a foreign key),
--  so renumbering does not affect orders or any other table.
-- ============================================================

BEGIN;

-- 1) Renumber existing customers contiguously, oldest first (by id).
WITH ordered AS (
    SELECT id, (ROW_NUMBER() OVER (ORDER BY id)) + 1004 AS seq
    FROM customers
)
UPDATE customers c
SET customer_code = 'MFHCUS' || o.seq
FROM ordered o
WHERE c.id = o.id;

-- 2) Create the counter for future codes (if not already present) and
--    seed it to continue right after the highest code just assigned.
CREATE SEQUENCE IF NOT EXISTS customer_code_seq;
SELECT setval(
    'customer_code_seq',
    GREATEST(
        1004,
        (SELECT COALESCE(
            MAX(CAST(SUBSTRING(customer_code FROM 'MFHCUS([0-9]+)$') AS INTEGER)),
            1004)
         FROM customers)
    ),
    true   -- next nextval() returns this value + 1
);

COMMIT;

-- Verify:
--   SELECT customer_code, first_name, last_name FROM customers ORDER BY id;
--   SELECT last_value FROM customer_code_seq;
