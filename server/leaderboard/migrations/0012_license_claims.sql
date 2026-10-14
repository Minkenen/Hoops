-- A license key belongs to the first account that uses it (stored as a hash), with the last answer from Lemon Squeezy.
CREATE TABLE IF NOT EXISTS license_claims (
  key_hash TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  claimed_at INTEGER NOT NULL,
  valid INTEGER NOT NULL DEFAULT 0,
  unlock TEXT,
  theme TEXT,
  checked_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS license_claims_player_idx ON license_claims(player_id);
