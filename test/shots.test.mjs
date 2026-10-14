import test from "node:test";
import assert from "node:assert/strict";
import { shotProblem, soloCourt, matchCourt, isFar } from "../server/leaderboard/src/shots.js";
import { BALL_R, HOOPS } from "../shared/hoopSprites.ts";
import { maxSpeed, maxRimHeight, replayHoopTarget, matchHoopTarget } from "../shared/court.ts";

const good = { artW: 800, artH: 500, floorY: 452, x: 300, y: 452 - BALL_R, vx: 2, vy: -6, gs: 0.8 };

test("a shot from the floor with a speed the hand can give is fine", () => assert.equal(shotProblem(good), null));

test("every impossible shot is named", () => {
  const cases = {
    "starts in the air": { y: 200 },
    "starts below the floor": { y: 452 },
    "starts outside the court": { x: 2 },
    "too fast": { vx: 40, vy: 40 },
    "gravity above 1": { gs: 1.2 },
    "gravity below 0": { gs: -0.1 },
    "screen too wide": { artW: 5000 },
    "screen too narrow": { artW: 100 },
    "floor too high up the screen": { floorY: 100 },
    "floor below the screen": { floorY: 600 },
    "not a number": { vx: NaN },
    "missing": { gs: undefined },
  };
  for (const [name, change] of Object.entries(cases)) assert.notEqual(shotProblem({ ...good, ...change }), null, name);
  assert.notEqual(shotProblem(null), null);
  assert.notEqual(shotProblem("a shot"), null);
});

test("the fastest allowed shot grows with the screen but never below the base speed", () => {
  assert.equal(maxSpeed(10), 9);
  assert.ok(maxSpeed(2000) > maxSpeed(800));
  assert.equal(shotProblem({ ...good, vx: maxSpeed(800), vy: 0 }), null);
  assert.notEqual(shotProblem({ ...good, vx: maxSpeed(800) + 0.01, vy: 0 }), null);
});

test("the solo court follows from the seed and the shot number, and nothing else the player says", () => {
  const a = soloCourt("seed-of-a-session", 4, good);
  assert.deepEqual(a, soloCourt("seed-of-a-session", 4, { ...good, vx: 0, vy: 0 }));
  const t = replayHoopTarget("seed-of-a-session", 4, good.artH);
  assert.equal(a.side, t.side);
  assert.equal(a.hoop.rimY, Math.max(good.floorY - t.rimHeight, 8 + HOOPS[t.side].sp.rimY));
  assert.notDeepEqual(a.hoop, soloCourt("seed-of-a-session", 5, good).hoop);
  assert.notDeepEqual(a.hoop, soloCourt("another-seed-here", 4, good).hoop);
});

test("rim heights stay inside what the game allows", () => {
  for (let i = 0; i < 500; i++) {
    const t = replayHoopTarget(`seed-${i}-xxxxxxxx`, i, 500);
    assert.ok(t.rimHeight >= 70 && t.rimHeight <= maxRimHeight(500) + 1e-9, String(t.rimHeight));
    const m = matchHoopTarget(`seed-${i}-xxxxxxxx`, i, 500);
    assert.ok(m.rimHeight >= 70 && m.rimHeight <= maxRimHeight(500) + 1e-9);
  }
});

test("a long shot is far, a close one is not", () => {
  const c = matchCourt("room-seed-123456", 0, good);
  assert.equal(isFar({ ...good, x: c.ringX + 10 }, c.ringX), false);
  assert.equal(isFar({ ...good, x: c.ringX + good.artW * 0.6 }, c.ringX), true);
});

test("a hoop from the seed comes on the other side when the ball is too close to the seed's side (the game and the server use the same rule)", async () => {
  const { hoopSide, replayHoopTarget } = await import("../shared/court.ts");
  const L = HOOPS.left.ref.w;
  const R = HOOPS.right.ref.w;
  // find a session whose first shot has its hoop on the right
  let seed = "s0";
  for (let i = 0; replayHoopTarget(seed, 0, 500).side !== "right"; i++) seed = `s${i}`;
  const near = { ...good, x: 800 - 30, y: 452 - BALL_R };
  const far = { ...good, x: 300, y: 452 - BALL_R };
  assert.equal(soloCourt(seed, 0, far).side, "right", "ball far away: the seed's side");
  assert.equal(soloCourt(seed, 0, near).side, "left", "ball at the right wall: the hoop is on the left");
  assert.equal(hoopSide("right", 800 - 30, 800, L, R), "left");
  assert.equal(hoopSide("left", 30, 800, L, R), "right");
  assert.equal(hoopSide("left", 400, 800, L, R), "left");
  // a screen so narrow that the ball is too close to both sides: nothing to flip to, the seed's side stays
  assert.equal(hoopSide("right", 80, 150, L, R), "right");
});
