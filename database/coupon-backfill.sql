-- Past coupon uses that were never written down
-- =============================================
--
-- Until today a prepaid order was usually written by the Cashfree webhook,
-- which recorded no coupon code and no discount and spent nothing. So those
-- orders leave no trace in coupon_redemptions, and the per-customer limit
-- cannot see them: every one of those customers gets ONE more use of the code
-- before the new rule starts biting.
--
-- This file does not guess. Step 1 shows you the orders; you decide. Step 2 is
-- the insert, commented out, for the ones you pick.
--
-- Run with:  psql -U postgres -d mahalaxmi_fashionhub -f database/coupon-backfill.sql


-- ── STEP 1. Read only. Which orders have no coupon recorded? ───────────────
--
-- Compare "goods" (what the cart is worth at today's catalogue prices) with
-- "total". A gap with no coupon_code is an order that was discounted and never
-- recorded. Wallet and shipping can also explain a gap, which is exactly why
-- this is for you to read rather than for a script to act on.

\echo ''
\echo '=== Orders with no coupon recorded, newest first ==='

SELECT
    o.order_id,
    to_char(COALESCE(o.placed_at, o.created_at) AT TIME ZONE 'Asia/Kolkata', 'DD Mon HH24:MI') AS placed_ist,
    o.method,
    o.status,
    COALESCE(c.phone, '') AS phone,
    COALESCE(c.email, '') AS email,
    o.subtotal,
    o.discount_amount,
    o.wallet_used,
    o.total,
    o.coupon_code
FROM site_orders o
LEFT JOIN LATERAL (
    SELECT
        NULLIF(o.customer_json::jsonb ->> 'phone', '') AS phone,
        NULLIF(o.customer_json::jsonb ->> 'email', '') AS email
) c ON TRUE
WHERE (o.coupon_code IS NULL OR o.coupon_code = '')
  AND o.status NOT IN ('Cancelled')
ORDER BY COALESCE(o.placed_at, o.created_at) DESC
LIMIT 100;


\echo ''
\echo '=== What each code has been counted for so far ==='

SELECT code, used_count, max_uses, max_per_customer, is_active
FROM coupons
ORDER BY code;


\echo ''
\echo '=== Who is already recorded against a code ==='

SELECT code_lower, id_kind, id_value, uses, order_id
FROM coupon_redemptions
ORDER BY code_lower, id_kind, id_value;


-- ── STEP 2. Write down a use that really happened ──────────────────────────
--
-- Uncomment, set the three values, run. One row per identity you want the
-- limit to recognise - the phone AND the email if the order carried both,
-- because either one matching is enough to refuse the next attempt.
--
-- id_value must be NORMALISED the way the app normalises it:
--   phone -> the LAST TEN digits, no +91, no spaces, no dashes
--   email -> all lower case, trimmed
--
-- ON CONFLICT keeps this safe to run twice: a row that is already there is
-- left exactly as it is rather than having its count pushed up again.

-- INSERT INTO coupon_redemptions (code_lower, id_kind, id_value, order_id, uses)
-- VALUES ('welcome10', 'phone', '6375394642', 'MFH17926623821469617', 1)
-- ON CONFLICT (code_lower, id_kind, id_value) DO NOTHING;

-- INSERT INTO coupon_redemptions (code_lower, id_kind, id_value, order_id, uses)
-- VALUES ('welcome10', 'email', 'someone@example.com', 'MFH17926623821469617', 1)
-- ON CONFLICT (code_lower, id_kind, id_value) DO NOTHING;


-- ── Optional: also correct the code's own counter ──────────────────────────
--
-- used_count is the ceiling across everybody, and it was never raised for
-- these orders either. Only do this if you want those past orders counted
-- towards max_uses; it has no effect on the per-customer rule.

-- UPDATE coupons SET used_count = used_count + 1 WHERE lower(code) = 'welcome10';


\echo ''
\echo 'Nothing above was changed. Step 2 is commented out on purpose.'
