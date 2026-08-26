PRAGMA foreign_keys = ON;

ALTER TABLE users ADD COLUMN subscription_started_at TEXT;
ALTER TABLE users ADD COLUMN subscription_expires_at TEXT;

ALTER TABLE credits ADD COLUMN subscription_credits INTEGER NOT NULL DEFAULT 0 CHECK (subscription_credits >= 0);
ALTER TABLE credits ADD COLUMN purchased_credits INTEGER NOT NULL DEFAULT 0 CHECK (purchased_credits >= 0);

CREATE TABLE IF NOT EXISTS credit_ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  source_id TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS trial_keys (
  id TEXT PRIMARY KEY,
  trial_key_hash TEXT NOT NULL UNIQUE,
  telegram_user_id TEXT NOT NULL UNIQUE,
  used_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  used_at TEXT,
  FOREIGN KEY (used_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_credit_ledger_user_id_created_at ON credit_ledger(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_trial_keys_used_by_user_id ON trial_keys(used_by_user_id);
