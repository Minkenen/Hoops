-- One-time recovery of goals that were lost because the replay check refused every phone screen (fixed in the server update that follows 0.1.25).
-- One goal is one point: the score is the number of goals each player has made (103 and 86 according to their own apps).
-- Evidence: both players have 'Replay: Shot dimensions are invalid.' flags from version 0.1.25 on 2026-10-14, and the totals below are what their own
-- apps saved in their profile on the server (accuracy 61 % and 47 %, which is believable). These numbers are the players' own, not replay-verified:
-- that is why this is run by hand, once, for these two accounts only. New goals are verified as always.

-- PontusJordanBulls: nothing was ever counted, so the row is created (103 goals = 103 points, 169 throws, best streak 8)
INSERT OR IGNORE INTO scores (player_id, best_score, best_streak, throws, goals, updated_at, version, streak)
VALUES ('299a099b-9ec8-4929-8c99-5ac985f21017', 103, 8, 169, 103, strftime('%s','now') * 1000, '0.1.25', 1);
INSERT OR IGNORE INTO weekly_scores (player_id, week, best_score, gained_score)
VALUES ('299a099b-9ec8-4929-8c99-5ac985f21017', '2026-10-12', 103, 103);

-- Beenana (was Nala): had 13 points counted before the phone problem; her app says 86 goals (= 86 points), 184 throws, best streak 8
UPDATE scores SET best_score = MAX(best_score, 86), best_streak = MAX(best_streak, 8), throws = MAX(throws, 184), goals = MAX(goals, 86), updated_at = strftime('%s','now') * 1000
WHERE player_id = '8d81b763-fb5c-4c66-9b6b-874250647586';
UPDATE weekly_scores SET best_score = MAX(best_score, 86), gained_score = MAX(gained_score, 73)
WHERE player_id = '8d81b763-fb5c-4c66-9b6b-874250647586' AND week = '2026-10-12';
