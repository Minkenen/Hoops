import test from "node:test";
import assert from "node:assert/strict";
import { stepWorld, BALL_RADIUS } from "../shared/world.ts";
import { maxSpeed, placeHoop, poleBox, worldHoop, replayHoopTarget, matchHoopTarget } from "../shared/court.ts";
import { HOOPS, BALL_R } from "../shared/hoopSprites.ts";
import { legacySub } from "./helpers/legacy-sub.mjs";

const SUB_DT = 0.25 * 1.25; // the game's fixed sub-step (4 per 1/60 s tick)

test("the shared ball radius is the sprite ball radius", () => assert.equal(BALL_RADIUS, BALL_R));

let seed = 0x2468ace;
const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 0x100000000; };

function scenario() {
  const artW = 500 + Math.floor(random() * 900);
  const artH = 300 + Math.floor(random() * 500);
  const floorY = artH - 48 - Math.floor(random() * 40);
  const side = random() < 0.5 ? "left" : "right";
  const { sp, ref } = HOOPS[side];
  const at = placeHoop(sp, ref, side, artW, floorY, 70 + random() * 190);
  const hoop = worldHoop(sp, at, artH, true);
  const speedMax = maxSpeed(artW);
  const power = 0.35 + random() * 0.65;
  const ang = -Math.PI / 2 + (random() - 0.5) * 1.6;
  const ball = { x: 40 + random() * (artW - 80), y: floorY - BALL_R - random() * 120, vx: Math.cos(ang) * power * speedMax, vy: Math.sin(ang) * power * speedMax, t: 0, gs: random(), ang: 0, scored: false, noScore: false, entering: false };
  return { artW, floorY, hoop, ball };
}

test("the shared step plays out exactly like the game's old step (500 shots, every frame)", () => {
  let events = 0;
  let goals = 0;
  for (let n = 0; n < 500; n++) {
    const s = scenario();
    const oldBall = { ...s.ball };
    const newBall = { ...s.ball };
    const g = { ball: oldBall, hoop: { sprite: { frontX: s.hoop.frontX, backX: s.hoop.backX, hull: s.hoop.hull, netLen: s.hoop.netLen }, x0: s.hoop.x0, y0: s.hoop.y0, rimY: s.hoop.rimY, poleBox: s.hoop.poleBox, phase: "shown" }, floorY: s.floorY, artW: s.artW, bounces: 0, neighbor: () => null, events: [] };
    let bounces = 0;
    const got = [];
    const hooks = {
      hit: (kind) => got.push(["hit", kind]),
      goal: () => { newBall.scored = true; newBall.postGoal = true; newBall.vx *= 0.3; got.push(["goal"]); },
      fell: () => got.push(["fell"]),
      floorBounce: () => got.push(["floorBounce"]),
      wall: () => got.push(["wall"]),
    };
    for (let tick = 0; tick < 400; tick++) {
      for (let k = 0; k < 4; k++) {
        legacySub(g, SUB_DT);
        const r = stepWorld(newBall, { dt: SUB_DT, floorY: s.floorY, artW: s.artW, hoop: s.hoop, bounces, hooks });
        bounces = r.bounces;
        for (const key of ["x", "y", "vx", "vy", "t", "ang"]) assert.equal(newBall[key], oldBall[key], `shot ${n} tick ${tick} ${key}`);
        assert.equal(newBall.scored, oldBall.scored);
        assert.equal(newBall.noScore, oldBall.noScore);
        assert.equal(bounces, g.bounces);
      }
      assert.deepEqual(got, g.events, `shot ${n} events`);
    }
    events += g.events.length;
    if (g.events.some((e) => e[0] === "goal")) goals++;
  }
  assert.ok(events > 5000, "the scenarios must exercise collisions");
  assert.ok(goals > 10 && goals < 400, `goals ${goals}: the scenarios must contain both goals and misses`);
});

test("hoop targets follow from the seed", () => {
  const a = replayHoopTarget("seed-one-1234", 3, 600);
  assert.deepEqual(a, replayHoopTarget("seed-one-1234", 3, 600));
  assert.notDeepEqual(a, replayHoopTarget("seed-two-1234", 3, 600));
});

// The old way the game placed a hoop and chose its side and height, copied from before the move to shared/court.ts.
const legacyHash = (value) => { let h = 0; for (let i = 0; i < value.length; i++) h = (Math.imul(31, h) + value.charCodeAt(i)) | 0; return Math.abs(h); };

test("the hoop is placed exactly where the game's old code put it (both sides, 1000 screens)", () => {
  for (let i = 0; i < 1000; i++) {
    const artW = 400 + Math.floor(random() * 1600);
    const artH = 250 + Math.floor(random() * 900);
    const floorY = artH - 48 - Math.floor(random() * 60);
    const side = random() < 0.5 ? "left" : "right";
    const { sp, ref } = HOOPS[side];
    const rimHeight = 70 + random() * 190;
    let rimY = floorY - rimHeight;
    rimY = Math.max(rimY, 8 + sp.rimY);
    const x0 = side === "right" ? artW - ref.w + ref.rimCx - sp.rimCx : ref.rimCx - sp.rimCx;
    const at = placeHoop(sp, ref, side, artW, floorY, rimHeight);
    assert.deepEqual(at, { x0, y0: rimY - sp.rimY, rimY });
    const poleBottom = random() < 0.5 ? artH : floorY + 30;
    const legacyPole = [sp.poleTop[0], sp.poleTop[1], [sp.poleTop[1][0], poleBottom - (rimY - sp.rimY) + 2], [sp.poleTop[0][0], poleBottom - (rimY - sp.rimY) + 2]];
    assert.deepEqual(poleBox(sp, rimY, poleBottom), legacyPole);
  }
});

test("the side and height of a hoop follow the old formulas (solo session and online match)", () => {
  for (let i = 0; i < 2000; i++) {
    const seedText = `seed-${i}-${Math.floor(random() * 1e9)}`;
    const artH = 250 + Math.floor(random() * 900);
    const maxH = Math.min(260, artH * 0.6);
    const n = legacyHash(`${seedText}:${i}`);
    assert.deepEqual(replayHoopTarget(seedText, i, artH), { side: n % 2 ? "right" : "left", rimHeight: 70 + ((n % 100000) / 100000) * Math.max(10, maxH - 70) });
    const side = legacyHash(`${seedText}:${i}:side`) % 2 ? "right" : "left";
    const height = 70 + (legacyHash(`${seedText}:${i}:height`) / 0x7fffffff) * Math.max(10, maxH - 70);
    assert.deepEqual(matchHoopTarget(seedText, i, artH), { side, rimHeight: height });
  }
});

test("the fastest shot is the game's own formula", () => {
  for (const w of [200, 500, 900, 1400, 2000]) assert.equal(maxSpeed(w), Math.max(9, Math.sqrt(1.35 * 0.16 * w)));
});
