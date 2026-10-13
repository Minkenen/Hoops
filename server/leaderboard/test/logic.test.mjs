import test from "node:test";
import assert from "node:assert/strict";
import { cleanNickname, defaultNickname, nicknameDecision, nicknameLower, scoreDecision, weekKey } from "../src/logic.js";

test("weekKey starts on Monday UTC", () => {
  assert.equal(weekKey(Date.UTC(2026, 9, 12, 0, 0, 0)), "2026-10-12");
  assert.equal(weekKey(Date.UTC(2026, 9, 18, 23, 59, 0)), "2026-10-12");
});

test("scoreDecision rejects non-integers and inconsistent stats", () => {
  assert.equal(scoreDecision({ score: 1.5, bestStreak: 1, throws: 2, goals: 1 }, null).ok, false);
  assert.equal(scoreDecision({ score: 3, bestStreak: 1, throws: 2, goals: 1 }, null).ok, false);
});

test("scoreDecision rate limits and checks lifetime deltas", () => {
  const previous = { best_score: 10, best_streak: 1, throws: 10, goals: 10, updated_at: 1_000_000 };
  assert.equal(scoreDecision({ score: 11, bestStreak: 1, throws: 11, goals: 11 }, previous, 1_010_000).ok, false);
  assert.equal(scoreDecision({ score: 500, bestStreak: 1, throws: 500, goals: 500 }, previous, 1_120_000).ok, false);
});

test("scoreDecision rejects impossible counter changes", () => {
  const previous = { best_score: 10, best_streak: 2, throws: 10, goals: 10, updated_at: 1_000_000 };
  assert.equal(scoreDecision({ score: 10, bestStreak: 2, throws: 9, goals: 9 }, previous, 1_100_000).ok, false);
  assert.equal(scoreDecision({ score: 11, bestStreak: 2, throws: 10, goals: 11 }, previous, 1_100_000).ok, false);
  assert.equal(scoreDecision({ score: 12, bestStreak: 2, throws: 11, goals: 11 }, previous, 1_100_000).ok, false);
});

test("scoreDecision caps a first submission", () => {
  assert.equal(scoreDecision({ score: 201, bestStreak: 1, throws: 201, goals: 201 }, null, 1_000_000).ok, false);
  assert.equal(scoreDecision({ score: 20, bestStreak: 3, throws: 20, goals: 20 }, null, 1_000_000).ok, true);
});

test("cleanNickname filters bad or empty names", () => {
  assert.equal(cleanNickname("  Court Kid!! "), "Court Kid");
  assert.equal(cleanNickname("Mi"), null);
  assert.equal(cleanNickname("fuck"), null);
});

test("nicknameLower compares cleaned names case-insensitively", () => {
  assert.equal(nicknameLower("Mia "), "mia");
  assert.equal(nicknameLower(" mia"), "mia");
});

test("nicknameDecision rejects taken names with different capital letters", () => {
  const existing = new Set(["mia"]);
  assert.deepEqual(nicknameDecision("Mia ", existing), { ok: false, status: 409, error: "That name is taken. Try another." });
});

test("nicknameDecision rejects invalid names with the user-facing message", () => {
  assert.deepEqual(nicknameDecision("Mi"), { ok: false, status: 400, error: "Use 3 to 18 letters, numbers, spaces, - or _." });
});

test("defaultNickname can retry with different digits", () => {
  const first = defaultNickname("same-provider-hash", 0);
  const retry = defaultNickname("same-provider-hash", 1);
  assert.match(first, /^HoopsFan\d{4}$/);
  assert.match(retry, /^HoopsFan\d{4}$/);
  assert.notEqual(first, retry);
});
