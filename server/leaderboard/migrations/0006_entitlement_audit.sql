CREATE TABLE IF NOT EXISTS entitlement_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  checked_at INTEGER NOT NULL,
  valid_count INTEGER NOT NULL,
  all_access INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS entitlement_checks_player_idx ON entitlement_checks(player_id, checked_at DESC);
