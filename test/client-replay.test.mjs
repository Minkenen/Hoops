// The app's side of a replay session: what it records, how a new session starts, and that the server accepts what it recorded.
import test from "node:test";
import assert from "node:assert/strict";

const clock = { t: 5000 };
Object.defineProperty(globalThis, "performance", { value: { now: () => clock.t }, configurable: true });
const replay = await import("../src/replay.ts");
const { verifyReplay, TICK_MS } = await import("../server/leaderboard/src/replay.js");
const { findHand } = await import("./helpers/client.mjs");
const { placeHoop } = await import("../shared/court.ts");
const { HOOPS } = await import("../shared/hoopSprites.ts");

const SEED = "server-seed-for-the-app-test";
const view = { artW: 800, artH: 500, floorY: 452 };

/** The hoop the game builds for the next shot, as the number of the shot it was made for. */
function hoopForNextShot() {
  const target = replay.currentReplayTarget(view.artH);
  if (!target) return { index: null };
  const { sp, ref } = HOOPS[target.side];
  return { index: target.index, at: placeHoop(sp, ref, target.side, view.artW, view.floorY, target.rimHeight) };
}
/** One shot, played like the game does, with the time the game would have noted. */
function take(wantGoal) {
  const hoop = hoopForNextShot();
  const found = findHand(SEED, hoop.index ?? replay.currentReplayTarget(view.artH)?.index ?? 0, wantGoal);
  const id = replay.replayShot({ x: found.hand.x, y: found.hand.y, vx: found.hand.vx, vy: found.hand.vy, gs: found.hand.gs }, view, hoop.index);
  clock.t += found.ticks * TICK_MS;
  replay.replayResult(id, found.outcome === "goal");
  clock.t += 2500;
  return id;
}

test("no session, nothing is recorded and the hoop is free to be anywhere", () => {
  replay.resetReplay();
  assert.equal(replay.currentReplayTarget(500), null);
  assert.equal(replay.replayShot({ x: 1, y: 2, vx: 0, vy: 0, gs: 1 }, view, null), -1);
  assert.equal(replay.replayPayload("0.1.24"), null);
  assert.equal(replay.hasReplaySession(), false);
});

test("a session: every hoop is the seed's hoop for that shot, and the server accepts the recording", () => {
  replay.setReplaySession("session_id_000001", SEED);
  const results = [true, false, true, true, false, true];
  for (const goal of results) take(goal);
  assert.equal(replay.replayBusy(), false);
  const payload = replay.replayPayload("0.1.24");
  const r = verifyReplay(payload, SEED);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.outcomes, results);
  assert.equal(r.voided, 0);
});

test("a new session starts the numbering again, and its first hoop is the new seed's hoop", () => {
  let called = 0;
  replay.onReplaySession(() => { called++; });
  replay.setReplaySession("session_id_000002", SEED + "-second");
  assert.equal(called, 1);
  assert.equal(replay.currentReplayTarget(500).index, 0);
  assert.equal(replay.replayPayload("0.1.24"), null);
});

test("the hoop made before the session arrived is not the seed's: that shot is not counted, the rest still are", () => {
  replay.resetReplay();
  const beforeSession = hoopForNextShot(); // no session yet: a free hoop
  assert.equal(beforeSession.index, null);
  replay.setReplaySession("session_id_000003", SEED);
  const found = findHand(SEED, 0, true);
  const id = replay.replayShot(found.hand, view, beforeSession.index);
  clock.t += found.ticks * TICK_MS;
  replay.replayResult(id, true);
  clock.t += 2500;
  take(true);
  take(false);
  const r = verifyReplay(replay.replayPayload("0.1.24"), SEED);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual([r.throws, r.goals, r.voided, r.trusted], [3, 2, 1, [0]]); // the goal in the shot at the wrong hoop is a trusted goal
});

test("a shot is not complete until it is decided: the replay waits for it", () => {
  replay.setReplaySession("session_id_000004", SEED);
  const found = findHand(SEED, 0, true);
  const id = replay.replayShot(found.hand, view, hoopForNextShot().index);
  assert.equal(replay.replayBusy(), true);
  assert.equal(replay.replayPayload("0.1.24"), null);
  clock.t += found.ticks * TICK_MS;
  replay.replayResult(id, true);
  assert.equal(replay.replayBusy(), false);
  assert.notEqual(replay.replayPayload("0.1.24"), null);
});

test("a shot that was never decided is dropped when the next one starts", () => {
  replay.setReplaySession("session_id_000005", SEED);
  const a = findHand(SEED, 0, true);
  replay.replayShot(a.hand, view, hoopForNextShot().index); // never decided
  clock.t += 3000;
  take(true); // the next one
  const r = verifyReplay(replay.replayPayload("0.1.24"), SEED);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual([r.throws, r.voided], [1, 1]);
});

test("a shot something else touched is voided, and the numbering holds", () => {
  replay.setReplaySession("session_id_000006", SEED);
  const found = findHand(SEED, 0, true);
  const id = replay.replayShot(found.hand, view, hoopForNextShot().index);
  clock.t += 500;
  replay.replayVoid(id); // another screen took it: the shot ends here, a miss
  clock.t += 2500;
  take(true);
  const r = verifyReplay(replay.replayPayload("0.1.24"), SEED);
  assert.deepEqual([r.ok, r.throws, r.goals, r.voided], [true, 2, 1, 1]);
});

test("a hero or the owl met the ball but it flies on and scores: the goal is recorded (as a trusted goal), nothing is lost", () => {
  replay.setReplaySession("session_id_000007", SEED);
  const found = findHand(SEED, 0, true);
  const id = replay.replayShot(found.hand, view, hoopForNextShot().index);
  clock.t += 400;
  replay.replayVoid(id, false); // met the hero in the air
  assert.equal(replay.replayBusy(), true, "the shot is still not decided");
  clock.t += found.ticks * TICK_MS;
  replay.replayResult(id, true); // and it went in
  clock.t += 2500;
  const r = verifyReplay(replay.replayPayload("0.1.24"), SEED);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual([r.throws, r.goals, r.voided, r.trusted], [1, 1, 1, [0]]);
});

test("while the replay is on its way, shots are not recorded and hoops are free; after it, recording starts over", () => {
  replay.setReplaySession("session_id_000007", SEED);
  take(true);
  replay.replaySubmitting(true);
  assert.equal(replay.currentReplayTarget(500), null);
  assert.equal(replay.replayShot({ x: 5, y: 5, vx: 0, vy: 0, gs: 1 }, view, null), -1);
  replay.replaySubmitting(false);
  assert.notEqual(replay.currentReplayTarget(500), null);
  replay.resetReplay();
  assert.equal(replay.hasReplaySession(), false);
});

test("at most 200 shots are recorded in a session; the hoop is then free until the session is renewed", () => {
  replay.setReplaySession("session_id_000008", SEED);
  for (let i = 0; i < 200; i++) {
    const hoop = hoopForNextShot();
    const found = findHand(SEED, i, i % 25 === 0);
    const id = replay.replayShot(found.hand, view, hoop.index);
    assert.equal(id, i);
    clock.t += found.ticks * TICK_MS;
    replay.replayResult(id, found.outcome === "goal");
    clock.t += 1000;
  }
  assert.equal(replay.currentReplayTarget(500), null);
  assert.equal(replay.replayShot({ x: 5, y: 5, vx: 0, vy: 0, gs: 1 }, view, 200), -1);
  assert.equal(verifyReplay(replay.replayPayload("0.1.24"), SEED).ok, true);
});

test("the session is changed at once, so the shot right after is recorded against the new seed's hoop and counts (no gap, no void shot)", () => {
  replay.resetReplay();
  replay.setReplaySession("session_id_000020", SEED);
  const first = [true, false, true];
  for (const goal of first) take(goal);
  // the new session is in hand: the shots of now are taken out and recording carries on in the new one
  const SEED2 = SEED + "-next";
  const out = replay.rotateReplay("session_id_000021", SEED2, "0.1.25");
  assert.equal(out.sessionId, "session_id_000020");
  assert.deepEqual(verifyReplay(out, SEED).outcomes, first);
  assert.deepEqual(replay.pendingReplays().map((p) => p.sessionId), ["session_id_000020"], "waits in the list until it is delivered");
  // the very next shot uses the new seed's hoop (index 0 of the new session) and is not void
  const target = replay.currentReplayTarget(view.artH);
  assert.equal(target.index, 0);
  const found = findHand(SEED2, 0, true);
  const id = replay.replayShot(found.hand, view, 0);
  clock.t += found.ticks * TICK_MS;
  replay.replayResult(id, true);
  clock.t += 2500;
  const r = verifyReplay(replay.replayPayload("0.1.25"), SEED2);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual([r.goals, r.voided], [1, 0]);
  replay.dropPending("session_id_000020");
  assert.deepEqual(replay.pendingReplays(), []);
});
