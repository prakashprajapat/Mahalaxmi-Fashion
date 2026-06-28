-- ============================================================
-- Mahalaxmi Fashion Hub — PostgreSQL Schema
-- Converted from MySQL | Next.js + .NET + PostgreSQL stack
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ────────────────────────────────────────────────
-- 1. PRODUCTS
-- ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
    id               SERIAL PRIMARY KEY,
    sku              VARCHAR(120),
    name             VARCHAR(255)    NOT NULL DEFAULT '',
    category         VARCHAR(80)     NOT NULL DEFAULT '',
    subcategory      VARCHAR(80)     NOT NULL DEFAULT '',
    price            NUMERIC(10,2)   NOT NULL DEFAULT 0,
    discount_price   NUMERIC(10,2),
    max_price        NUMERIC(10,2),
    stock_status     VARCHAR(40)     NOT NULL DEFAULT 'In Stock',
    description      TEXT,
    newest           INT             NOT NULL DEFAULT 0,
    image            TEXT,
    extra_json       JSONB,
    best_seller      BOOLEAN         NOT NULL DEFAULT FALSE,
    created_at       TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_sku      ON products (sku);
CREATE INDEX IF NOT EXISTS idx_products_newest   ON products (newest DESC);
CREATE INDEX IF NOT EXISTS idx_products_category ON products (category);
CREATE INDEX IF NOT EXISTS idx_products_extra    ON products USING GIN (extra_json);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_products_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ────────────────────────────────────────────────
-- 2. CUSTOMERS
-- ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
    id                SERIAL PRIMARY KEY,
    customer_code     VARCHAR(40)     NOT NULL UNIQUE,
    first_name        VARCHAR(120)    NOT NULL DEFAULT '',
    last_name         VARCHAR(120)    NOT NULL DEFAULT '',
    gender            VARCHAR(10)     NOT NULL DEFAULT '',
    email             VARCHAR(255)    NOT NULL DEFAULT '',
    phone             VARCHAR(30)     NOT NULL DEFAULT '',
    date_of_birth     DATE,
    marriage_date     DATE,
    addr_line1        VARCHAR(255)    NOT NULL DEFAULT '',
    addr_line2        VARCHAR(255)    NOT NULL DEFAULT '',
    pincode           VARCHAR(10)     NOT NULL DEFAULT '',
    post_office       VARCHAR(120)    NOT NULL DEFAULT '',
    state             VARCHAR(80)     NOT NULL DEFAULT '',
    district          VARCHAR(80)     NOT NULL DEFAULT '',
    address_text      TEXT,
    notes             TEXT,
    marketing_consent BOOLEAN         NOT NULL DEFAULT FALSE,
    submitted_at      VARCHAR(80)     NOT NULL DEFAULT '',
    profile_status    VARCHAR(40)     NOT NULL DEFAULT 'Approved',
    contact_status    VARCHAR(40)     NOT NULL DEFAULT 'Ready For Support',
    password_hash     VARCHAR(128)    NOT NULL DEFAULT '',
    password_salt     VARCHAR(64)     NOT NULL DEFAULT '',
    account_status    VARCHAR(20)     NOT NULL DEFAULT 'active',
    pan_number        VARCHAR(12)     NOT NULL DEFAULT '',
    pan_name          VARCHAR(120)    NOT NULL DEFAULT '',
    pan_image         TEXT,
    pan_status        VARCHAR(30)     NOT NULL DEFAULT 'Pending Verification',
    email_verified    BOOLEAN         NOT NULL DEFAULT FALSE,
    phone_verified    BOOLEAN         NOT NULL DEFAULT FALSE,
    deactivated_at    TIMESTAMPTZ,
    created_at        TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_email ON customers (email);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers (phone);

CREATE TRIGGER trg_customers_updated_at
    BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ────────────────────────────────────────────────
-- 3. OTP TOKENS (WhatsApp / Email OTP)
-- ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS otp_tokens (
    id          SERIAL PRIMARY KEY,
    phone       VARCHAR(30),
    email       VARCHAR(255),
    otp_hash    VARCHAR(128)    NOT NULL,
    purpose     VARCHAR(40)     NOT NULL DEFAULT 'login',
    attempts    INT             NOT NULL DEFAULT 0,
    expires_at  TIMESTAMPTZ     NOT NULL,
    used        BOOLEAN         NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_otp_phone  ON otp_tokens (phone);
CREATE INDEX IF NOT EXISTS idx_otp_email  ON otp_tokens (email);
CREATE INDEX IF NOT EXISTS idx_otp_expiry ON otp_tokens (expires_at);

-- ────────────────────────────────────────────────
-- 4. ADMIN TOKENS
-- ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_tokens (
    id          SERIAL PRIMARY KEY,
    email       VARCHAR(255)    NOT NULL,
    token_hash  VARCHAR(64)     NOT NULL UNIQUE,
    role        VARCHAR(40)     NOT NULL DEFAULT 'admin',
    expires_at  TIMESTAMPTZ     NOT NULL,
    created_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_token_hash ON admin_tokens (token_hash);

-- ────────────────────────────────────────────────
-- 5. SITE ORDERS
-- ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS site_orders (
    id              SERIAL PRIMARY KEY,
    order_id        VARCHAR(80)     NOT NULL UNIQUE,
    method          VARCHAR(40)     NOT NULL DEFAULT '',
    status          VARCHAR(80)     NOT NULL DEFAULT '',
    payment_id      VARCHAR(100),
    awb             VARCHAR(80),
    subtotal        NUMERIC(12,2)   NOT NULL DEFAULT 0,
    shipping_cost   NUMERIC(12,2)   NOT NULL DEFAULT 0,
    cod_fee         NUMERIC(12,2)   NOT NULL DEFAULT 0,
    total           NUMERIC(12,2)   NOT NULL DEFAULT 0,
    cart_json       JSONB,
    customer_json   JSONB,
    shipping_json   JSONB,
    raw_json        JSONB,
    placed_at       TIMESTAMPTZ,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_status     ON site_orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_placed_at  ON site_orders (placed_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_payment_id ON site_orders (payment_id);

CREATE TRIGGER trg_site_orders_updated_at
    BEFORE UPDATE ON site_orders
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ────────────────────────────────────────────────
-- 6. RAZORPAY ORDERS
-- ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS razorpay_orders (
    id                      SERIAL PRIMARY KEY,
    local_order_id          VARCHAR(40)     NOT NULL UNIQUE,
    razorpay_order_id       VARCHAR(80)     NOT NULL UNIQUE,
    amount_paise            INT             NOT NULL,
    currency                VARCHAR(3)      NOT NULL DEFAULT 'INR',
    status                  VARCHAR(40)     NOT NULL DEFAULT 'created',
    cart_json               JSONB,
    shipping_json           JSONB,
    customer_json           JSONB,
    razorpay_payment_id     VARCHAR(80),
    razorpay_signature      VARCHAR(128),
    raw_order_json          JSONB,
    raw_verify_json         JSONB,
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    paid_at                 TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_rp_payment_id ON razorpay_orders (razorpay_payment_id);

-- ────────────────────────────────────────────────
-- 7. SITE SETTINGS
-- ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS site_settings (
    id          SERIAL PRIMARY KEY,
    setting_key VARCHAR(64)     NOT NULL UNIQUE,
    setting_val TEXT            NOT NULL,
    updated_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_site_settings_updated_at
    BEFORE UPDATE ON site_settings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ────────────────────────────────────────────────
-- 8. WISHLISTS
-- ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wishlists (
    id          SERIAL PRIMARY KEY,
    customer_id INT             NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    product_id  INT             NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    added_at    TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    UNIQUE (customer_id, product_id)
);

-- ────────────────────────────────────────────────
-- 9. REVIEWS
-- ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reviews (
    id          SERIAL PRIMARY KEY,
    product_id  INT             NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    customer_id INT             REFERENCES customers(id) ON DELETE SET NULL,
    rating      SMALLINT        NOT NULL CHECK (rating BETWEEN 1 AND 5),
    title       VARCHAR(255),
    body        TEXT,
    status      VARCHAR(20)     NOT NULL DEFAULT 'pending',
    created_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews (product_id);

-- ────────────────────────────────────────────────
-- 10. NEWSLETTER SUBSCRIPTIONS
-- ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS newsletter_subscriptions (
    id          SERIAL PRIMARY KEY,
    email       VARCHAR(255)    NOT NULL UNIQUE,
    status      VARCHAR(20)     NOT NULL DEFAULT 'active',
    subscribed_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ────────────────────────────────────────────────
-- DEFAULT SETTINGS SEED
-- ────────────────────────────────────────────────
INSERT INTO site_settings (setting_key, setting_val) VALUES
    ('store_name',         'Mahalaxmi Fashion Hub'),
    ('store_email',        'contact@mahalaxmifashionhub.com'),
    ('store_phone',        '+91 XXXXXXXXXX'),
    ('store_address',      'Your Store Address Here'),
    ('shipping_free_above','999'),
    ('shipping_flat_rate', '60'),
    ('cod_fee',            '50'),
    ('gst_default_rate',   '5'),
    ('razorpay_key_id',    ''),
    ('delhivery_token',    ''),
    ('whatsapp_api_key',   '')
ON CONFLICT (setting_key) DO NOTHING;
