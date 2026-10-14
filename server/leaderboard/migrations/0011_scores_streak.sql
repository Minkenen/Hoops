-- The running streak is kept on the server and worked out from verified replays.
ALTER TABLE scores ADD COLUMN streak INTEGER NOT NULL DEFAULT 0;
-- A replay is claimed by exactly one score submission: the token tells which one.
ALTER TABLE replays ADD COLUMN claim TEXT;
