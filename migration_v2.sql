-- Mahalaxmi Fashion Hub — DB Migration v2
-- Run on VPS: PGPASSWORD='YOUR_DB_PASSWORD' psql -h localhost -U postgres -d mahalaxmi_fashionhub -f migration_v2.sql

-- BUG-2: Accurate delivery timestamp for 7-day return window
ALTER TABLE site_orders ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

-- MISS-6: PAN details on orders for high-value (₹2L+) compliance
ALTER TABLE site_orders ADD COLUMN IF NOT EXISTS pan_number text;
ALTER TABLE site_orders ADD COLUMN IF NOT EXISTS pan_name text;

-- BUG-5: Dedicated order_id column on reviews (replaces Title misuse)
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS order_id text;

-- PERF-5: Performance indexes
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_site_orders_status ON site_orders(status);
CREATE INDEX IF NOT EXISTS idx_site_orders_placed_at ON site_orders(placed_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(status);
CREATE INDEX IF NOT EXISTS idx_reviews_product_id ON reviews(product_id);

-- BUG-5: Migrate existing orderId data from title column to order_id column
UPDATE reviews SET order_id = title WHERE order_id IS NULL AND title IS NOT NULL;

SELECT 'Migration v2 complete.' AS result;
