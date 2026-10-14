import test from "node:test";
import assert from "node:assert/strict";
import { stepBall } from "../shared/physics.ts";
import { simulateReplayShot } from "../server/leaderboard/src/replay.js";

test("shared client/server free-flight stays identical for 2000 shots", () => {
  let seed = 0x12345678;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    return (seed >>> 0) / 0x100000000;
  };
  for (let i = 0; i < 2000; i++) {
    const shot = { x: 70000 + random() * 600, y: 30000 + random() * 300, vx: -1.5 + random() * 3, vy: -2 + random() * 2, gs: 0.25 + random() * 1.75, t: 0, resultT: 250 + Math.floor(random() * 500), width: 100000, height: 100000, floorY: 90000, hoopX: 10000, hoopY: 10000, hoopL: 8000, hoopR: 12000, boardL: 4000, boardR: 6000, boardT: 4000, boardB: 8000 };
    const expected = { x: shot.x, y: shot.y, vx: shot.vx, vy: shot.vy, t: 0, gs: shot.gs, ang: 0 };
    for (let elapsed = 0; elapsed < shot.resultT;) { const dt = Math.min(1, shot.resultT - elapsed); stepBall(expected, { dt, radius: 1 }); elapsed += dt; }
    const actual = simulateReplayShot(shot);
    assert.equal(actual.flight, shot.resultT);
    assert.ok(Math.abs(actual.x - expected.x) < 1e-9);
    assert.ok(Math.abs(actual.y - expected.y) < 1e-9);
    assert.ok(Math.abs(actual.vx - expected.vx) < 1e-9);
    assert.ok(Math.abs(actual.vy - expected.vy) < 1e-9);
  }
});
