-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: products whose size/colour stock table is ALL ZEROS while the product is
-- still on sale.
--
-- Kya hua tha: Add/Edit Product form me sizes/colours select kiye gaye but
-- "Stock table" khaali chhod diya gaya. Form phir bhi ek table save kar deta tha
-- jisme har cell 0 hai, aur Total Qty (e.g. 500) alag se save hoti thi.
-- Website "In Stock" dikhati thi (status Total Qty se banta hai), lekin checkout
-- isi table me se stock ghatata hai — table me 0 mila, to COD order reject:
--   "'<product>' just went out of stock. Please update your cart and try again."
--
-- Fix: aisa khaali table hata do. Product "untracked" ho jata hai — bilkul un
-- products ki tarah jinke sizes nahi hain — status Total Qty se chalta hai aur
-- checkout use chhedta nahi. Koi stock number invent NAHI kiya ja raha.
--
-- Jo products sach me sold out hain unhe chhua nahi jata: unka stock_status
-- 'Out of Stock' hota hai, aur wo yahan se exclude hain.
--
-- Chalane ka tarika (VPS par, repo folder me jahan docker-compose.yml hai):
--   git pull
--   docker exec -i mfh_postgres psql -U postgres -d mahalaxmi_fashionhub \
--     < backend/Scripts/fix-blank-variant-stock.sql
--
-- Ye script chalte hi live site theek ho jayegi — iske liye koi deploy/rebuild
-- ki zarurat nahi. Code ka fix (jo dobara aisa hone se rokta hai) agle deploy
-- me chala jayega.
--
-- Pehle sirf dekhna ho (kuch change na ho) to neeche COMMIT ki jagah ROLLBACK
-- kar dein — list phir bhi print hogi.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE TEMP TABLE blank_stock_products ON COMMIT DROP AS
SELECT id, sku, name, extra_json -> 'variantMatrix' AS old_matrix
FROM products
WHERE jsonb_typeof(extra_json -> 'variantMatrix') = 'object'
  AND (SELECT count(*) FROM jsonb_each(extra_json -> 'variantMatrix')) > 0
  -- koi bhi cell > 0 nahi hai
  AND NOT EXISTS (
        SELECT 1
        FROM jsonb_each(extra_json -> 'variantMatrix') AS v
        WHERE CASE
                WHEN jsonb_typeof(v.value) = 'number' THEN (v.value #>> '{}')::numeric
                WHEN jsonb_typeof(v.value) = 'string'
                     AND (v.value #>> '{}') ~ '^[0-9]+(\.[0-9]+)?$' THEN (v.value #>> '{}')::numeric
                ELSE 0
              END > 0
      )
  -- genuinely sold-out products ko chhodo
  AND lower(coalesce(stock_status, '')) <> 'out of stock';

\echo '--- Products that will be fixed ---'
SELECT sku, name, old_matrix FROM blank_stock_products ORDER BY sku;

\echo '--- Count ---'
SELECT count(*) AS products_fixed FROM blank_stock_products;

UPDATE products p
SET extra_json = (p.extra_json - 'variantMatrix') - 'stockMode',
    updated_at = now()
FROM blank_stock_products b
WHERE p.id = b.id;

COMMIT;
