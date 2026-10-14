import test from "node:test";
import assert from "node:assert/strict";
import { simulateReplayShot, verifyReplay } from "../server/leaderboard/src/replay.js";

const shot = (id, t, goal = false) => {
  const right = id === 0;
  const hoopY = 300 - (70 + (hash(`session_123:${id}`) % 100000) / 100000 * 190);
  return { id, t, resultT: t + 1200, width: 800, height: 600, floorY: 300, x: right ? 700 : 100, y: 150, vx: 0, vy: -6, nx: right ? 0.875 : 0.125, ny: 0.25, gs: 1, hoopX: right ? 700 : 100, hoopY, hoopL: right ? 680 : 80, hoopR: right ? 720 : 120, goal };
};
const hash = (value) => { let h = 0; for (let i = 0; i < value.length; i++) h = Math.imul(31, h) + value.charCodeAt(i) | 0; return Math.abs(h); };

test("accepts an ordered, plausible replay", () => {
  const result = verifyReplay({ sessionId: "session_123", seed: "session_123", goals: 1, shots: [shot(0, 0), shot(1, 1200, true)] });
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

test("rejects oversized replay geometry", () => {
  assert.equal(verifyReplay({ sessionId: "session_123", seed: "session_123", shots: [{ ...shot(0, 0), width: 4800, hoopR: 1180 }] }).ok, false);
  assert.equal(verifyReplay({ sessionId: "session_123", seed: "session_123", shots: [{ ...shot(0, 0), hoopL: 40, hoopR: 180 }] }).ok, false);
});

test("rejects coordinates that disagree with normalized replay data", () => {
  assert.equal(verifyReplay({ sessionId: "session_123", seed: "session_123", shots: [{ ...shot(0, 0), nx: 0.2 }] }).ok, false);
});

test("rejects a score that does not match the replay", () => {
  assert.equal(verifyReplay({ sessionId: "session_123", goals: 2, shots: [shot(0, 0, true)] }).ok, false);
});

test("simulates free flight with replay timing", () => {
  const result = simulateReplayShot({ ...shot(0, 0), resultT: 1200 });
  assert.equal(result.flight, 1200);
  assert.equal(typeof result.crossed, "boolean");
});

test("keeps the replay simulation bounded after floor and wall bounces", () => {
  const result = simulateReplayShot({ ...shot(0, 0), x: 790, y: 290, vx: 40, vy: 20, resultT: 1200 });
  assert.equal(result.flight, 1200);
  assert.equal(typeof result.crossed, "boolean");
});

test("replay simulation uses the shared ball radius and rim collisions", () => {
  const result = simulateReplayShot({
    ...shot(0, 0),
    x: 100,
    y: 200,
    vx: 0,
    vy: 2,
    hoopX: 100,
    hoopY: 300,
    hoopL: 80,
    hoopR: 120,
    resultT: 250,
  });
  assert.equal(result.crossed, false);
  assert.ok(result.bounces >= 1);
  assert.ok(result.x !== 100 || result.vy < 0);
});
