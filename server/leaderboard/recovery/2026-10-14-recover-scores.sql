-- One-time recovery of goals that never reached the leaderboard (the replay check was too strict for phones, and old apps could not send replays).
-- The leaderboard score is the number of goals a player has made: every player gets what their own app saved in their profile on the server,
-- the higher of their best score and their total goals (the developer's own account keeps its 702 this way).
-- Only profiles that add up are used (goals never more than throws), and nobody's score is ever lowered.
-- These numbers are the players' own, not replay-verified: this is run by hand, once. From now on the score is the sum of verified goals.

-- 1. a score row for every player with a plausible profile who has none
INSERT OR IGNORE INTO scores (player_id, best_score, best_streak, throws, goals, updated_at, version, streak)
SELECT f.player_id, 0, 0, 0, 0, strftime('%s','now') * 1000, 'recovery', 0
FROM profiles f
WHERE json_valid(f.data) AND COALESCE(json_extract(f.data, '$.stats.goals'), 0) <= COALESCE(json_extract(f.data, '$.stats.throws'), 0);

-- 2. the score is the goals the player made (the goals counter follows it, so they stay the same from here on)
UPDATE scores SET
  best_score = MIN(100000, MAX(best_score, c.v)),
  goals = MIN(100000, MAX(goals, c.v)),
  throws = MAX(throws, c.t),
  best_streak = MAX(best_streak, c.b),
  updated_at = strftime('%s','now') * 1000
FROM (
  SELECT f.player_id AS pid,
         MAX(COALESCE(json_extract(f.data, '$.best'), 0), COALESCE(json_extract(f.data, '$.stats.goals'), 0)) AS v,
         COALESCE(json_extract(f.data, '$.stats.throws'), 0) AS t,
         COALESCE(json_extract(f.data, '$.stats.bestStreak'), 0) AS b
  FROM profiles f
  WHERE json_valid(f.data) AND COALESCE(json_extract(f.data, '$.stats.goals'), 0) <= COALESCE(json_extract(f.data, '$.stats.throws'), 0)
) AS c
WHERE scores.player_id = c.pid;

-- 3. this week's board (everything was played this week, 2026-10-12)
INSERT OR IGNORE INTO weekly_scores (player_id, week, best_score, gained_score)
SELECT player_id, '2026-10-12', 0, 0 FROM scores;
UPDATE weekly_scores SET
  best_score = MAX(best_score, (SELECT s.best_score FROM scores s WHERE s.player_id = weekly_scores.player_id)),
  gained_score = MIN(5000, MAX(gained_score, (SELECT s.best_score FROM scores s WHERE s.player_id = weekly_scores.player_id)))
WHERE week = '2026-10-12';
