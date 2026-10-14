import test from "node:test";
import assert from "node:assert/strict";
import { advance, createMatch, forfeit, nextDue, rest, snapshot, startShot, REST_TIMEOUT_MS, SPEED_GOAL, T21_GOAL, HORSE_LETTERS } from "../server/leaderboard/src/match.js";
import { findMatchHand } from "./helpers/client.mjs";

const A = "player-a";
const B = "player-b";
const SEED = "room-seed-0123456789";
let clock = 1_000_000;
const make = (game, first = A) => createMatch({ game, seed: SEED, playerIds: [A, B], firstPlayerId: first, now: clock });

/** Shoots for `id` the way the app would, and lets the flight play out. Returns what the server decided. */
function shoot(m, id, wantGoal, opts = {}) {
  const seedKey = m.game === "speed" ? `${SEED}:${id}` : SEED;
  const round = m.game === "speed" ? m.rounds[id] : m.round;
  const found = findMatchHand(seedKey, round, wantGoal, opts);
  clock += 1000;
  const r = startShot(m, id, { type: "shot", shotId: m.shotCount[id], ...found.hand }, clock);
  assert.equal(r.ok, true, JSON.stringify(r));
  clock = nextDue(m) + 1;
  assert.equal(advance(m, clock), true);
  return found;
}
const bounce = (m, id, nx = 0.4) => { clock += 100; assert.equal(rest(m, id, { type: "rest", nx }, clock).ok, true); };

test("Speedball: both shoot at once, a goal is a point, first to 10 wins", () => {
  const m = make("speed");
  assert.equal(m.turn, null);
  for (let i = 0; i < SPEED_GOAL - 1; i++) { shoot(m, A, true); shoot(m, B, i % 2 === 0); }
  assert.deepEqual([m.scores[A], m.scores[B], m.over], [9, 5, null]);
  shoot(m, B, true);
  assert.equal(m.over, null);
  shoot(m, A, true);
  assert.deepEqual(m.over, { winnerId: A, reason: "got to 10 first" });
  assert.equal(m.scores[A], 10);
});

test("Speedball: both can have a shot in the air at the same time, but not two of their own", () => {
  const m = make("speed");
  const a = findMatchHand(`${SEED}:${A}`, 0, true);
  const b = findMatchHand(`${SEED}:${B}`, 0, true);
  clock += 1000;
  assert.equal(startShot(m, A, { type: "shot", shotId: 0, ...a.hand }, clock).ok, true);
  assert.equal(startShot(m, B, { type: "shot", shotId: 0, ...b.hand }, clock + 5).ok, true);
  const again = findMatchHand(`${SEED}:${A}`, 0, true);
  assert.equal(startShot(m, A, { type: "shot", shotId: 1, ...again.hand }, clock + 900).code, "shot_in_flight");
});

test("each player's hoop in Speedball comes from the seed and their own number of results", () => {
  const m = make("speed");
  const first = shoot(m, A, true); // round 0 for A
  const viaB = findMatchHand(`${SEED}:${B}`, 0, true); // B has had no result: still round 0 of B's seed
  clock += 1000;
  assert.equal(startShot(m, B, { type: "shot", shotId: 0, ...viaB.hand }, clock).ok, true);
  assert.ok(first.ticks > 0);
  assert.equal(m.rounds[A], 1);
  assert.equal(m.rounds[B], 0);
});

test("21: turns, one point for a goal, two from far away, first to 21", () => {
  const m = make("t21");
  let who = A;
  const other = () => (who === A ? B : A);
  shoot(m, A, true, { far: false });
  assert.equal(m.scores[A], 1);
  bounce(m, A);
  assert.equal(m.turn, B);
  shoot(m, B, true, { far: true });
  assert.equal(m.scores[B], 2);
  bounce(m, B);
  // run A up to the end with far goals
  for (let i = 0; i < 12 && !m.over; i++) {
    shoot(m, A, true, { far: true });
    if (m.over) break;
    bounce(m, A);
    shoot(m, B, false);
    bounce(m, B);
  }
  assert.deepEqual(m.over && m.over.winnerId, A);
  assert.ok(m.scores[A] >= T21_GOAL);
  void who; void other;
});

test("HORSE: a miss is a letter, a goal is not, five letters lose", () => {
  const m = make("horse");
  shoot(m, A, true);
  assert.deepEqual([m.letters[A], m.letters[B]], [0, 0]);
  bounce(m, A);
  for (let i = 0; i < HORSE_LETTERS; i++) {
    shoot(m, B, false);
    if (m.over) break;
    bounce(m, B);
    shoot(m, A, true);
    bounce(m, A);
  }
  assert.deepEqual(m.over, { winnerId: A, reason: "spelled HORSE" });
  assert.equal(m.letters[B], HORSE_LETTERS);
});

test("HORSE and 21: nobody shoots out of turn, and not before the turn is passed on", () => {
  const m = make("horse", B);
  const hand = findMatchHand(SEED, 0, true).hand;
  clock += 1000;
  assert.equal(startShot(m, A, { type: "shot", shotId: 0, ...hand }, clock).code, "wrong_turn");
  assert.equal(startShot(m, B, { type: "shot", shotId: 0, ...hand }, clock).ok, true);
  const hand2 = findMatchHand(SEED, 0, true).hand;
  assert.equal(startShot(m, A, { type: "shot", shotId: 0, ...hand2 }, clock + 10).code, "wrong_turn");
  assert.equal(startShot(m, B, { type: "shot", shotId: 1, ...hand2 }, clock + 900).code, "shot_in_flight");
  clock = nextDue(m) + 1;
  advance(m, clock);
  assert.equal(m.awaitingRest, B);
  assert.equal(startShot(m, B, { type: "shot", shotId: 1, ...hand2 }, clock + 900).code, "wait_for_rest");
  assert.equal(startShot(m, A, { type: "shot", shotId: 0, ...hand2 }, clock + 900).code, "wrong_turn");
  bounce(m, B);
  assert.equal(m.turn, A);
});

test("the turn is passed on by the shooter's rest, or by the server when it is late", () => {
  const m = make("t21");
  shoot(m, A, false);
  assert.equal(nextDue(m), m.restDueAt);
  assert.equal(rest(m, B, { type: "rest", nx: 0.5 }, clock).code, "bad_rest");
  assert.equal(rest(m, A, { type: "rest", nx: 7 }, clock).code, "bad_rest");
  assert.equal(rest(m, A, { type: "rest", nx: "left" }, clock).code, "bad_rest");
  clock = m.restDueAt - 1;
  assert.equal(advance(m, clock), false);
  clock = m.restDueAt;
  assert.equal(advance(m, clock), true);
  assert.equal(m.turn, B);
  assert.equal(m.awaitingRest, null);
  assert.equal(m.last.type, "rest");
});

test("the result is the server's: the player cannot say how the shot went, what it is worth or what the score is", () => {
  const m = make("t21");
  const miss = findMatchHand(SEED, 0, false);
  clock += 1000;
  const r = startShot(m, A, { type: "shot", shotId: 0, ...miss.hand, goal: true, far: true, score: 99, letters: 0, resultT: 1, width: 1, hoopL: -5, hoopR: 9999 }, clock);
  assert.equal(r.ok, true);
  clock = nextDue(m) + 1;
  advance(m, clock);
  assert.deepEqual([m.scores[A], m.last.goal, m.last.far], [0, false, false]);
});

test("a shot is checked like every other shot: the court is the room's, the ball starts on the floor, the speed is a hand's", () => {
  const m = make("speed");
  const hand = findMatchHand(`${SEED}:${A}`, 0, true).hand;
  clock += 1000;
  for (const change of [{ y: 100 }, { vx: 50, vy: 50 }, { gs: 3 }, { artW: 50 }, { floorY: 1 }, { x: -3 }]) {
    assert.equal(startShot(m, A, { type: "shot", shotId: 0, ...hand, ...change }, clock).code, "bad_shot", JSON.stringify(change));
  }
  assert.equal(m.shotCount[A], 0);
  assert.equal(startShot(m, A, { type: "shot", shotId: 0, ...hand }, clock).ok, true);
});

test("shot numbers must be the next one: no repeats, no gaps, no strings", () => {
  const m = make("speed");
  const hand = findMatchHand(`${SEED}:${A}`, 0, true).hand;
  clock += 1000;
  for (const bad of [1, -1, 0.5, "0", null, undefined]) assert.equal(startShot(m, A, { type: "shot", shotId: bad, ...hand }, clock).code, "bad_shot_id", String(bad));
  assert.equal(startShot(m, A, { type: "shot", shotId: 0, ...hand }, clock).ok, true);
  clock = nextDue(m) + 1;
  advance(m, clock);
  const next = findMatchHand(`${SEED}:${A}`, 1, true).hand;
  clock += 1000;
  assert.equal(startShot(m, A, { type: "shot", shotId: 0, ...next }, clock).code, "bad_shot_id");
  assert.equal(startShot(m, A, { type: "shot", shotId: 1, ...next }, clock).ok, true);
});

test("shots cannot come faster than a hand can shoot", () => {
  const m = make("speed");
  const hand = findMatchHand(`${SEED}:${A}`, 0, true).hand;
  clock += 1000;
  assert.equal(startShot(m, A, { type: "shot", shotId: 0, ...hand }, clock).ok, true);
  clock = nextDue(m) + 1; // the flight is over
  advance(m, clock);
  const next = findMatchHand(`${SEED}:${A}`, 1, true).hand;
  assert.equal(startShot(m, A, { type: "shot", shotId: 1, ...next }, m.lastShotAt[A] + 100).code, "too_fast");
});

test("nothing happens after the match is over", () => {
  const m = make("speed");
  forfeit(m, B);
  const hand = findMatchHand(`${SEED}:${A}`, 0, true).hand;
  assert.equal(startShot(m, A, { type: "shot", shotId: 0, ...hand }, clock + 5000).code, "match_over");
  assert.equal(rest(m, A, { type: "rest", nx: 0.5 }, clock).code, "match_over");
  assert.equal(advance(m, clock + 99999), false);
  assert.equal(nextDue(m), null);
  assert.deepEqual(m.over.winnerId, A);
  assert.equal(forfeit(m, A), false);
});

test("a player who is not in the match cannot shoot", () => {
  const m = make("speed");
  const hand = findMatchHand(`${SEED}:${A}`, 0, true).hand;
  assert.equal(startShot(m, "someone-else", { type: "shot", shotId: 0, ...hand }, clock + 1000).code, "not_in_match");
});

test("both players are told the same state, which grows with every change", () => {
  const m = make("t21");
  const seen = [snapshot(m).seq];
  shoot(m, A, true);
  seen.push(snapshot(m).seq);
  bounce(m, A);
  seen.push(snapshot(m).seq);
  assert.ok(seen.every((v, i) => i === 0 || v > seen[i - 1]), String(seen));
  const s = snapshot(m);
  assert.deepEqual(Object.keys(s.scores).sort(), [A, B].sort());
  assert.equal(s.turn, B);
  assert.equal(s.round, 1);
  assert.equal(s.active[A], null);
  JSON.stringify(s); // it is plain data
});

test("what the server decides is what the shot does: the same hand in the same court always gives the same result", () => {
  for (let i = 0; i < 20; i++) {
    const m1 = make("horse");
    const m2 = make("horse");
    const found = findMatchHand(SEED, 0, i % 2 === 0);
    for (const m of [m1, m2]) {
      clock += 1000;
      startShot(m, A, { type: "shot", shotId: 0, ...found.hand }, clock);
      advance(m, nextDue(m) + 1);
    }
    assert.equal(m1.last.goal, m2.last.goal);
    assert.equal(m1.last.goal, i % 2 === 0);
  }
});

test("REST_TIMEOUT_MS is long enough to stop a ball and short enough not to stall a match", () => {
  assert.ok(REST_TIMEOUT_MS >= 5_000 && REST_TIMEOUT_MS <= 30_000);
});
