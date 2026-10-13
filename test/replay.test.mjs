import test from "node:test";
import assert from "node:assert/strict";
import { verifyReplay } from "../server/leaderboard/src/replay.js";

const shot = (id, t, goal = false) => ({ id, t, x: 100, y: 100, vx: 400, vy: -600, nx: 0.5, ny: 0.5, goal });

test("accepts an ordered, plausible replay", () => {
  const result = verifyReplay({ sessionId: "session_123", goals: 1, shots: [shot(0, 0), shot(1, 1200, true)] });
  assert.deepEqual(result, { ok: true, shots: 2, goals: 1 });
});

test("rejects duplicate or reordered shot ids", () => {
  const result = verifyReplay({ sessionId: "session_123", shots: [shot(1, 0), shot(1, 1200)] });
  assert.equal(result.ok, false);
});

test("rejects impossible timing and speed", () => {
  assert.equal(verifyReplay({ sessionId: "session_123", shots: [shot(0, 0), shot(1, 100)] }).ok, false);
  assert.equal(verifyReplay({ sessionId: "session_123", shots: [{ ...shot(0, 0), vx: 9999 }] }).ok, false);
});

test("rejects a score that does not match the replay", () => {
  assert.equal(verifyReplay({ sessionId: "session_123", goals: 2, shots: [shot(0, 0, true)] }).ok, false);
});
