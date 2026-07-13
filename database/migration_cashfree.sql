-- Cashfree Payment Gateway support
-- VPS: psql -U postgres -d mahalaxmi_fashionhub -f database/migration_cashfree.sql

CREATE TABLE IF NOT EXISTS cashfree_orders (
    id                  SERIAL PRIMARY KEY,
    local_order_id      VARCHAR(64)  NOT NULL UNIQUE,
    cf_order_id         VARCHAR(128),
    payment_session_id  TEXT,
    amount_paise        INT          NOT NULL,
    currency            VARCHAR(8)   NOT NULL DEFAULT 'INR',
    status              VARCHAR(16)  NOT NULL DEFAULT 'created',
    cart_json           JSONB,
    shipping_json       JSONB,
    customer_json       JSONB,
    cf_payment_id       VARCHAR(128),
    raw_order_json      JSONB,
    raw_verify_json     JSONB,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    paid_at             TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cashfree_orders_cf_order_id ON cashfree_orders (cf_order_id);
CREATE INDEX IF NOT EXISTS idx_cashfree_orders_status      ON cashfree_orders (status);
