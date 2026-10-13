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
