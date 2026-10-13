CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_user_id_hash TEXT NOT NULL UNIQUE,
  nickname TEXT NOT NULL,
  nickname_lower TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0,
  color INTEGER
);

CREATE TABLE IF NOT EXISTS scores (
  player_id TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  best_score INTEGER NOT NULL DEFAULT 0,
  best_streak INTEGER NOT NULL DEFAULT 0,
  throws INTEGER NOT NULL DEFAULT 0,
  goals INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  version TEXT
);

CREATE TABLE IF NOT EXISTS weekly_scores (
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  week TEXT NOT NULL,
  best_score INTEGER NOT NULL DEFAULT 0,
  gained_score INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (player_id, week)
);

CREATE TABLE IF NOT EXISTS friends (
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  friend_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  PRIMARY KEY (player_id, friend_id)
);

CREATE TABLE IF NOT EXISTS score_submissions (
  key TEXT PRIMARY KEY,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS scores_best_score_idx ON scores(best_score DESC, updated_at ASC);
CREATE INDEX IF NOT EXISTS weekly_scores_week_score_idx ON weekly_scores(week, best_score DESC);

CREATE TABLE IF NOT EXISTS cheat_flags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,
  player_id TEXT,
  kind TEXT NOT NULL,
  detail TEXT NOT NULL,
  version TEXT
);

CREATE TABLE IF NOT EXISTS profiles (
  player_id TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS bug_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,
  category TEXT NOT NULL,
  message TEXT NOT NULL,
  version TEXT,
  system TEXT,
  nickname TEXT,
  ip_hash TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS bug_reports_ip ON bug_reports (ip_hash, created_at);

CREATE TABLE IF NOT EXISTS donate_events (
  variant TEXT NOT NULL,
  day TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (variant, day)
);
