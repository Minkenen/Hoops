ALTER TABLE replays ADD COLUMN used_at INTEGER;
CREATE INDEX IF NOT EXISTS replays_unused_idx ON replays(player_id, used_at);
