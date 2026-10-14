import test from "node:test";
import assert from "node:assert/strict";
import { verifyReplay, simulateShot, TICK_MS, MAX_SHOTS } from "../server/leaderboard/src/replay.js";
import { soloCourt } from "../server/leaderboard/src/shots.js";
import { buildReplay, findHand, playShot, randomHand } from "./helpers/client.mjs";

const SEED = "a-session-seed-from-the-server";
const ID = "session_12345678";

test("an honest replay: every goal is confirmed and the counts follow the shots", () => {
  const replay = buildReplay(ID, SEED, [{ goal: true }, { goal: false }, { goal: true }, { goal: true }, { goal: false }]);
  const r = verifyReplay(replay, SEED);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual([r.throws, r.goals, r.unconfirmed, r.voided], [5, 3, 0, 0]);
  assert.deepEqual(r.outcomes, [true, false, true, true, false]);
});

test("shots with a bank, a rim bounce or the board are confirmed too, not only clean ones", () => {
  let withContact = 0;
  for (let i = 0; i < 40; i++) {
    const found = findHand(SEED, i, true);
    if (found.hits > 0) withContact++;
    const replay = buildReplay(ID, SEED, Array.from({ length: i + 1 }, (_, k) => (k === i ? { hand: found.hand } : { goal: false })));
    const r = verifyReplay(replay, SEED);
    assert.equal(r.ok, true);
    assert.equal(r.outcomes[i], true, `shot ${i} (contact ${found.hits})`);
  }
  assert.ok(withContact > 5, `only ${withContact} of 40 goals touched something`);
});

test("the court is never taken from the player: any court field is refused", () => {
  const base = buildReplay(ID, SEED, [{ goal: true }]);
  for (const extra of [{ hoopX: 100 }, { hoopY: 100 }, { hoopL: 1 }, { hoopR: 5000 }, { boardL: 0 }, { width: 800 }, { height: 600 }, { side: "left" }, { rimHeight: 100 }]) {
    const forged = { ...base, shots: [{ ...base.shots[0], ...extra }] };
    const r = verifyReplay(forged, SEED);
    assert.equal(r.ok, false, JSON.stringify(extra));
    assert.match(r.reason, /court data/);
  }
});

test("the forged replay that used to pass is refused (a huge hoop, 200 goals)", () => {
  const hash = (v) => { let h = 0; for (let i = 0; i < v.length; i++) h = (Math.imul(31, h) + v.charCodeAt(i)) | 0; return Math.abs(h); };
  const W = 2000, H = 2000, shots = [];
  for (let i = 0; i < 200; i++) {
    const t = i * 800, side = hash(`${SEED}:${i}`) % 2 ? "right" : "left";
    const rimH = 70 + (hash(`${SEED}:${i}`) % 100000) / 100000 * Math.max(10, Math.min(260, H * 0.6) - 70);
    const floorY = 1800, hoopY = floorY - rimH, hoopX = side === "left" ? 500 : 1500;
    shots.push({ id: i, t, resultT: t + 1500, width: W, height: H, floorY, x: hoopX, y: hoopY - 100, vx: 0, vy: 1, nx: hoopX / W, ny: (hoopY - 100) / H, gs: 1, hoopX, hoopY, hoopL: hoopX - 159, hoopR: hoopX + 159, goal: true });
  }
  assert.equal(verifyReplay({ sessionId: ID, seed: SEED, version: "0.1.23", goals: 200, shots }, SEED).ok, false);
});

test("a goal claimed for a shot that misses is not counted", () => {
  const miss = findHand(SEED, 0, false);
  const replay = { sessionId: ID, seed: SEED, version: "0.1.24", shots: [{ id: 0, t: 1000, resultT: Math.round(1000 + miss.ticks * TICK_MS), ...miss.hand, goal: true, void: false }] };
  const r = verifyReplay(replay, SEED);
  assert.equal(r.ok, true);
  assert.deepEqual([r.throws, r.goals, r.unconfirmed], [1, 0, 1]);
});

test("a goal at the wrong time is not counted (the shot says it ended long after the replay does)", () => {
  const goal = findHand(SEED, 0, true);
  const flight = goal.ticks * TICK_MS;
  for (const bad of [flight * 3, flight + 5000, flight * 0.3]) {
    const replay = { sessionId: ID, seed: SEED, version: "0.1.24", shots: [{ id: 0, t: 1000, resultT: Math.round(1000 + bad), ...goal.hand, goal: true, void: false }] };
    const r = verifyReplay(replay, SEED);
    assert.equal(r.ok, true);
    assert.equal(r.goals, 0, `flight ${bad}`);
  }
});

test("a shot that would go in but is reported as a miss is a miss, never a goal", () => {
  const goal = findHand(SEED, 0, true);
  const replay = { sessionId: ID, seed: SEED, version: "0.1.24", shots: [{ id: 0, t: 1000, resultT: Math.round(1000 + goal.ticks * TICK_MS), ...goal.hand, goal: false, void: false }] };
  const r = verifyReplay(replay, SEED);
  assert.deepEqual([r.throws, r.goals], [1, 0]);
});

test("the hoop of every shot is the seed's hoop: a goal for another seed's hoop is not confirmed", () => {
  let notConfirmed = 0;
  for (let i = 0; i < 25; i++) {
    const found = findHand(SEED, i, true);
    const replay = buildReplay(ID, SEED, Array.from({ length: i + 1 }, (_, k) => (k === i ? { hand: found.hand } : { goal: false })));
    const r = verifyReplay(replay, "a-different-seed-entirely-x");
    if (r.ok && r.goals === 0) notConfirmed++;
  }
  assert.ok(notConfirmed >= 22, `only ${notConfirmed} of 25 were refused with the wrong seed`);
});

test("impossible shots refuse the whole replay", () => {
  const base = buildReplay(ID, SEED, [{ goal: true }, { goal: false }]);
  const change = (patch, i = 0) => ({ ...base, shots: base.shots.map((s, k) => (k === i ? { ...s, ...patch } : s)) });
  const bad = {
    "in the air": change({ y: 100 }),
    "too fast": change({ vx: 30, vy: -30 }),
    "gravity 3": change({ gs: 3 }),
    "screen 9000 wide": change({ artW: 9000 }),
    "floor far off": change({ floorY: 10 }),
    "ends before it starts": change({ resultT: 500 }),
    "flies for a minute": change({ resultT: 100000 }),
    "ids out of order": { ...base, shots: [base.shots[1], base.shots[0]] },
    "times out of order": change({ t: 0 }, 1),
    "shots 100 ms apart": { ...base, shots: [base.shots[0], { ...base.shots[1], t: base.shots[0].t + 100, resultT: base.shots[0].t + 100 + 1000 }] },
    "no shots": { ...base, shots: [] },
    "more than allowed": { ...base, shots: Array.from({ length: MAX_SHOTS + 1 }, (_, i) => ({ ...base.shots[1], id: i, t: 1000 + i * 1000, resultT: 1000 + i * 1000 + 800 })) },
    "a shot that is not an object": { ...base, shots: [null] },
    "a result that is not a boolean": change({ goal: "yes" }),
  };
  for (const [name, replay] of Object.entries(bad)) assert.equal(verifyReplay(replay, SEED).ok, false, name);
});

test("shots that something else touched (void) are not counted but keep the numbering", () => {
  const replay = buildReplay(ID, SEED, [{ goal: true }, { goal: true, void: true }, { goal: true }]);
  const r = verifyReplay(replay, SEED);
  assert.equal(r.ok, true);
  assert.deepEqual([r.throws, r.goals, r.voided], [2, 2, 1]);
});

test("a replay of voided shots only counts nothing", () => {
  const replay = buildReplay(ID, SEED, [{ goal: true, void: true }]);
  assert.equal(verifyReplay(replay, SEED).ok, false);
});

test("a program is recognised: nearly no misses, an even pace", () => {
  const wants = Array.from({ length: 36 }, () => ({ goal: true }));
  const replay = buildReplay(ID, SEED, wants, { gap: 2000 });
  const r = verifyReplay(replay, SEED);
  assert.equal(r.ok, true);
  assert.ok(r.suspicion.length >= 1, JSON.stringify(r.suspicion));
});

test("a person is not: mixed results at an uneven pace", () => {
  const wants = Array.from({ length: 36 }, (_, i) => ({ goal: i % 3 !== 0 }));
  const replay = buildReplay(ID, SEED, wants);
  replay.shots.forEach((s, i) => { const jitter = (i * 7919) % 900; s.t += i * 311 + jitter; s.resultT += i * 311 + jitter; });
  assert.deepEqual(verifyReplay(replay, SEED).suspicion, []);
});

test("the same hand gives the same result every time (the server's replay is deterministic)", () => {
  const hand = randomHand();
  const { hoop } = soloCourt(SEED, 3, hand);
  const a = simulateShot(hand, hoop);
  for (let i = 0; i < 5; i++) assert.deepEqual(simulateShot(hand, hoop), a);
  assert.deepEqual(playShot(hand, hoop).outcome, a.outcome);
});

test("a phone in portrait (a narrow, tall screen) can have its goals counted, in both sizes of ball", () => {
  for (const view of [{ artW: 195, artH: 422 }, { artW: 160, artH: 330 }, { artW: 195, artH: 190 }]) {
    const wants = [true, false, true, true].map((goal, i) => {
      const found = findHand(SEED, i, goal, { ...view, tries: 8000 });
      return { hand: found.hand };
    });
    const replay = buildReplay(ID, SEED, wants);
    const r = verifyReplay(replay, SEED);
    assert.equal(r.ok, true, `${JSON.stringify(view)} ${JSON.stringify(r)}`);
    assert.deepEqual([r.throws, r.goals, r.unconfirmed], [4, 3, 0], JSON.stringify(view));
  }
});
