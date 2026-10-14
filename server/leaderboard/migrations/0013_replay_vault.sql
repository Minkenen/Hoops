-- Replays the server could not count (yet) are kept here, so a goal is never lost: they are checked again later (after a fix) and counted then.
CREATE TABLE IF NOT EXISTS replay_vault (
  session_id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  reason TEXT NOT NULL,
  version TEXT,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'held',
  checked_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS replay_vault_player_idx ON replay_vault(player_id, status);
