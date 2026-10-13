CREATE TABLE IF NOT EXISTS replays (
  session_id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  client_version TEXT,
  shots INTEGER NOT NULL,
  goals INTEGER NOT NULL,
  data TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS replays_player_idx ON replays(player_id, created_at DESC);
