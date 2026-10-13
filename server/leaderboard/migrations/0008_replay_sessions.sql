CREATE TABLE IF NOT EXISTS replay_sessions (
  session_id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  seed TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  used_at INTEGER
);

CREATE INDEX IF NOT EXISTS replay_sessions_player_idx ON replay_sessions(player_id, created_at DESC);
