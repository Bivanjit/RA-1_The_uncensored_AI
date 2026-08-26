PRAGMA foreign_keys = ON;

-- Prevent a single entitlement source (especially a Telegram trial key)
-- from ever creating more than one credit-ledger grant.
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_ledger_source_id_unique
  ON credit_ledger(source_id)
  WHERE source_id IS NOT NULL;

-- Speed up and constrain lifetime daily-usage accounting.
CREATE INDEX IF NOT EXISTS idx_usage_user_action_created_at
  ON usage(user_id, action, created_at);

-- Trial keys are single-use by design; keep the lookup path indexed.
CREATE INDEX IF NOT EXISTS idx_trial_keys_hash_unused
  ON trial_keys(trial_key_hash, used_by_user_id);
