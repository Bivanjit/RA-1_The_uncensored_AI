PRAGMA foreign_keys = ON;

ALTER TABLE credits ADD COLUMN trial_credits INTEGER NOT NULL DEFAULT 0 CHECK (trial_credits >= 0);

CREATE TABLE IF NOT EXISTS credit_packs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  credits INTEGER NOT NULL CHECK (credits > 0),
  price_inr INTEGER NOT NULL CHECK (price_inr >= 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  price_inr INTEGER NOT NULL CHECK (price_inr >= 0),
  product_type TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);

INSERT OR IGNORE INTO credit_packs (id, name, credits, price_inr) VALUES
  ('pack_500', '+500 credits', 500, 0),
  ('pack_1000', '+1,000 credits', 1000, 0),
  ('pack_5000', '+5,000 credits', 5000, 0);

INSERT OR IGNORE INTO products (id, name, price_inr, product_type) VALUES
  ('source_code', 'RA-1 Source Code', 14999, 'source_code');

UPDATE users SET plan = 'free' WHERE plan IS NULL OR plan = '';
