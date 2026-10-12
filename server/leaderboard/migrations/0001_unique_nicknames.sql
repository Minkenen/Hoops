PRAGMA foreign_keys=off;

CREATE TABLE players_new (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_user_id_hash TEXT NOT NULL UNIQUE,
  nickname TEXT NOT NULL,
  nickname_lower TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

INSERT INTO players_new (id, provider, provider_user_id_hash, nickname, nickname_lower, created_at)
SELECT
  id,
  provider,
  provider_user_id_hash,
  nickname,
  CASE
    WHEN duplicate_number = 1 THEN nickname_key
    ELSE lower(substr(nickname_key, 1, 8) || '-' || substr(id, 1, 8))
  END,
  created_at
FROM (
  SELECT
    id,
    provider,
    provider_user_id_hash,
    nickname,
    lower(trim(nickname)) AS nickname_key,
    created_at,
    row_number() OVER (PARTITION BY lower(trim(nickname)) ORDER BY created_at ASC, id ASC) AS duplicate_number
  FROM players
);

DROP TABLE players;
ALTER TABLE players_new RENAME TO players;

PRAGMA foreign_keys=on;
