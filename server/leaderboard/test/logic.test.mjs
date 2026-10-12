import test from "node:test";
import assert from "node:assert/strict";
import { cleanNickname, scoreDecision, weekKey } from "../src/logic.js";

test("weekKey starts on Monday UTC", () => {
  assert.equal(weekKey(Date.UTC(2026, 9, 12, 0, 0, 0)), "2026-10-12");
  assert.equal(weekKey(Date.UTC(2026, 9, 18, 23, 59, 0)), "2026-10-12");
});

test("scoreDecision rejects non-integers and inconsistent stats", () => {
  assert.equal(scoreDecision({ score: 1.5, bestStreak: 1, throws: 2, goals: 1 }, null).ok, false);
  assert.equal(scoreDecision({ score: 3, bestStreak: 1, throws: 2, goals: 1 }, null).ok, false);
});

test("scoreDecision rate limits and ignores implausible jumps", () => {
  const previous = { best_score: 10, updated_at: 1_000_000 };
  assert.equal(scoreDecision({ score: 11, bestStreak: 1, throws: 20, goals: 11 }, previous, 1_010_000).ok, false);
  assert.equal(scoreDecision({ score: 500, bestStreak: 1, throws: 500, goals: 500 }, previous, 1_120_000).ok, false);
});

test("cleanNickname filters bad or empty names", () => {
  assert.equal(cleanNickname("  Court Kid!! "), "Court Kid");
  assert.equal(cleanNickname("fuck"), null);
});
