// Plays shots the way the game does (the shared ball step, 60 ticks a second, 4 sub-steps each), and builds the replay the app would upload.
import { stepWorld, BALL_RADIUS } from "../../shared/world.ts";
import { maxSpeed } from "../../shared/court.ts";
import { soloCourt, matchCourt } from "../../server/leaderboard/src/shots.js";

export const TICK_MS = 1000 / 60;
const SUB_DT = 0.25 * 1.25;

/** What the game decides about a shot: the first of a goal, a fall past the net, or a hard bounce on the floor. Returns { outcome, ticks, hits }. */
export function playShot(shot, hoop, maxTicks = 1800) {
  const ball = { x: shot.x, y: shot.y, vx: shot.vx, vy: shot.vy, t: 0, gs: shot.gs, ang: 0, scored: false, noScore: false };
  let outcome = "open";
  let ticks = 0;
  let hits = 0;
  let bounces = 0;
  const hooks = {
    hit: () => { hits++; },
    goal: () => { if (outcome === "open") { outcome = "goal"; ball.scored = true; } },
    fell: () => { if (outcome === "open") outcome = "miss"; },
    floorBounce: () => { if (outcome === "open" && !ball.scored) outcome = "miss"; },
  };
  while (ticks < maxTicks && outcome === "open") {
    ticks++;
    for (let k = 0; k < 4 && outcome === "open"; k++) bounces = stepWorld(ball, { dt: SUB_DT, floorY: shot.floorY, artW: shot.artW, hoop, bounces, hooks }).bounces;
  }
  return { outcome, ticks, hits };
}

let seed = 0x5eed;
export const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 0x100000000; };

/** A shot from the floor with a random hand. */
export function randomHand(artW = 800, artH = 500, floorY = artH - 48) {
  const power = 0.3 + random() * 0.7;
  const ang = -Math.PI / 2 + (random() - 0.5) * 1.8;
  const sm = maxSpeed(artW);
  return { artW, artH, floorY, x: 60 + random() * (artW - 120), y: floorY - BALL_RADIUS, vx: Math.cos(ang) * power * sm, vy: Math.sin(ang) * power * sm, gs: random() };
}

/** Finds a hand that scores (or misses) in the solo court of shot `index`. */
export function findHand(seedStr, index, wantGoal, { artW = 800, artH = 500, floorY = artH - 48, tries = 4000 } = {}) {
  for (let i = 0; i < tries; i++) {
    const hand = randomHand(artW, artH, floorY);
    const { hoop } = soloCourt(seedStr, index, hand);
    const r = playShot(hand, hoop);
    if ((r.outcome === "goal") === wantGoal && r.outcome !== "open") return { hand, ...r };
  }
  throw new Error("no hand found");
}

/** The replay the app would upload for these shots: [{ goal?: true|false, hand? }, ...] in order. */
export function buildReplay(sessionId, seedStr, wants, { start = 1000, gap = 2500 } = {}) {
  const shots = [];
  wants.forEach((want, index) => {
    const found = want.hand ? { hand: want.hand, ...playShot(want.hand, soloCourt(seedStr, index, want.hand).hoop) } : findHand(seedStr, index, !!want.goal);
    const t = start + index * gap;
    shots.push({ id: index, t, resultT: Math.round(t + found.ticks * TICK_MS), ...found.hand, goal: found.outcome === "goal", void: !!want.void });
  });
  return { sessionId, seed: seedStr, version: "0.1.24", shots };
}
