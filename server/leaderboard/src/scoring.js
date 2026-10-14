// What a verified replay is worth. The numbers come from the replay the server played, never from what the app says about itself.
export const SCORE_SYNC_MS = 3_000;
export const IP_SYNC_MS = 2_000;
export const WEEKLY_GAIN_CAP = 5000;
export const MAX_SCORE = 100_000;

/** The shape of a run of outcomes (true = goal) that the streak arithmetic needs. */
export function summarize(outcomes) {
  const throws = outcomes.length;
  let goals = 0;
  let run = 0;
  let bestRun = 0;
  let lead = 0;
  let leading = true;
  for (const goal of outcomes) {
    if (goal) {
      goals++;
      run++;
      if (leading) lead++;
      if (run > bestRun) bestRun = run;
    } else {
      leading = false;
      run = 0;
    }
  }
  return { throws, goals, bestRun, lead, trail: run, all: goals === throws };
}

/** What the app says its score is: a whole number, or null. */
export function claimedScore(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= MAX_SCORE ? n : null;
}

/**
 * The counters after a replay is added, the same arithmetic the database does (see the upsert in index.ts).
 * `previous` is the stored row or null. The score can grow by at most the goals of the replay.
 */
export function applyReplay(previous, summary, claimed) {
  const p = previous ?? { best_score: 0, best_streak: 0, throws: 0, goals: 0, streak: 0 };
  const streak = summary.all ? p.streak + summary.throws : summary.trail;
  return {
    throws: p.throws + summary.throws,
    goals: p.goals + summary.goals,
    best_score: Math.min(Math.max(p.best_score, claimed), p.best_score + summary.goals),
    best_streak: Math.max(p.best_streak, summary.bestRun, p.streak + summary.lead),
    streak,
  };
}
