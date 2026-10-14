// The room, with two fake sockets: what the server sends and what it refuses, message by message.
import test from "node:test";
import assert from "node:assert/strict";
import { MultiplayerHub } from "../server/leaderboard/src/index.ts";
import { findMatchHand } from "./helpers/client.mjs";

class Socket {
  constructor() { this.readyState = 1; this.got = []; }
  send(text) { this.got.push(JSON.parse(text)); }
  close() { this.readyState = 3; }
  of(type) { return this.got.filter((m) => m.type === type); }
  last(type) { const l = this.of(type); return l[l.length - 1]; }
}

function clockAndTimers() {
  const realNow = Date.now;
  const realSet = globalThis.setTimeout;
  const realClear = globalThis.clearTimeout;
  const clock = { t: 10_000_000, timers: [] };
  Date.now = () => clock.t;
  globalThis.setTimeout = (fn, ms) => { const id = { fn, at: clock.t + ms, live: true }; clock.timers.push(id); return id; };
  globalThis.clearTimeout = (id) => { if (id) id.live = false; };
  clock.advance = (ms) => {
    const target = clock.t + ms;
    for (;;) {
      const due = clock.timers.filter((x) => x.live && x.at <= target).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      due.live = false;
      clock.t = Math.max(clock.t, due.at);
      due.fn();
    }
    clock.t = target;
  };
  clock.restore = () => { Date.now = realNow; globalThis.setTimeout = realSet; globalThis.clearTimeout = realClear; };
  return clock;
}

function startRoom(game) {
  const hub = new MultiplayerHub({});
  const code = hub.makeRoom("a", game);
  const A = new Socket();
  const B = new Socket();
  hub.connectRoom({ id: "a", nickname: "Alpha" }, code, A);
  hub.connectRoom({ id: "b", nickname: "Bravo" }, code, B);
  const say = (ws, type, payload = {}) => hub.webSocketMessage(ws, JSON.stringify({ type, payload }));
  return { hub, code, A, B, say, room: [...hub.rooms.values()][0] };
}
async function readyBoth(r, clock) {
  await r.say(r.A, "ready", { ready: true });
  await r.say(r.B, "ready", { ready: true });
  clock.advance(3100);
}

test("when both are ready the server picks who starts and tells both, with the seed and the protocol", async () => {
  const clock = clockAndTimers();
  try {
    for (const game of ["horse", "t21", "speed"]) {
      const r = startRoom(game);
      assert.equal(r.A.of("start_countdown").length, 0);
      await readyBoth(r, clock);
      const a = r.A.last("start_countdown").payload;
      const b = r.B.last("start_countdown").payload;
      assert.deepEqual(a, b);
      assert.equal(a.protocol, "3");
      assert.equal(typeof a.seed, "string");
      if (game === "speed") assert.equal(a.firstPlayerId, null);
      else assert.ok(["a", "b"].includes(a.firstPlayerId));
      assert.equal(r.room.match.turn, game === "speed" ? null : a.firstPlayerId);
    }
  } finally { clock.restore(); }
});

test("the first player is chosen by the server, fairly: both players start sometimes", async () => {
  const clock = clockAndTimers();
  try {
    const firsts = new Set();
    for (let i = 0; i < 40; i++) {
      const r = startRoom("horse");
      await readyBoth(r, clock);
      firsts.add(r.A.last("start_countdown").payload.firstPlayerId);
    }
    assert.equal(firsts.size, 2);
  } finally { clock.restore(); }
});

test("no match events before the countdown is over, and nothing but shot and rest", async () => {
  const clock = clockAndTimers();
  try {
    const r = startRoom("speed");
    await r.say(r.A, "match_event", { event: { type: "shot", shotId: 0 } });
    assert.equal(r.A.last("error").payload.code, "not_started");
    await r.say(r.A, "ready", { ready: true });
    await r.say(r.B, "ready", { ready: true });
    await r.say(r.A, "match_event", { event: { type: "shot", shotId: 0 } });
    assert.equal(r.A.last("error").payload.code, "not_started");
    clock.advance(3100);
    for (const type of ["result", "goal", "score", "", undefined]) {
      await r.say(r.A, "match_event", { event: { type } });
      assert.equal(r.A.last("error").payload.code, "bad_match_event", String(type));
    }
    await r.say(r.A, "match_event", {});
    assert.equal(r.A.last("error").payload.code, "bad_match_event");
  } finally { clock.restore(); }
});

test("a shot reaches both players as a new state, and the result arrives when the flight is over", async () => {
  const clock = clockAndTimers();
  try {
    const r = startRoom("speed");
    await readyBoth(r, clock);
    const seed = r.room.match.seed;
    const found = findMatchHand(`${seed}:a`, 0, true);
    await r.say(r.A, "match_event", { event: { type: "shot", shotId: 0, ...found.hand } });
    for (const s of [r.A, r.B]) {
      const st = s.last("match_state").payload.state;
      assert.equal(st.active.a, 0);
      assert.equal(st.last.type, "shot");
      assert.equal(st.scores.a, 0);
    }
    clock.advance(found.ticks * (1000 / 60) + 500);
    for (const s of [r.A, r.B]) {
      const st = s.last("match_state").payload.state;
      assert.equal(st.scores.a, 1);
      assert.equal(st.active.a, null);
      assert.deepEqual([st.last.type, st.last.goal], ["result", true]);
    }
    assert.deepEqual(r.A.last("match_state").payload, r.B.last("match_state").payload);
  } finally { clock.restore(); }
});

test("an out-of-turn shot is refused with a reason and the real state, and changes nothing", async () => {
  const clock = clockAndTimers();
  try {
    const r = startRoom("horse");
    await readyBoth(r, clock);
    const first = r.room.match.turn;
    const other = first === "a" ? "b" : "a";
    const sockets = { a: r.A, b: r.B };
    const found = findMatchHand(r.room.match.seed, 0, true);
    await r.say(sockets[other], "match_event", { event: { type: "shot", shotId: 0, ...found.hand } });
    const err = sockets[other].last("error").payload;
    assert.equal(err.code, "wrong_turn");
    assert.equal(sockets[other].last("match_state").payload.state.turn, first);
    assert.equal(sockets[first].of("match_state").length, 0, "the other player is not bothered");
    assert.equal(r.room.match.shotCount[other], 0);
  } finally { clock.restore(); }
});

test("HORSE through the room: shot, result, rest, and the turn goes to the other player", async () => {
  const clock = clockAndTimers();
  try {
    const r = startRoom("horse");
    await readyBoth(r, clock);
    const first = r.room.match.turn;
    const sock = { a: r.A, b: r.B };
    const found = findMatchHand(r.room.match.seed, 0, false);
    await r.say(sock[first], "match_event", { event: { type: "shot", shotId: 0, ...found.hand } });
    clock.advance(found.ticks * (1000 / 60) + 500);
    let st = r.A.last("match_state").payload.state;
    assert.equal(st.letters[first], 1);
    assert.equal(st.awaitingRest, first);
    await r.say(sock[first], "match_event", { event: { type: "rest", nx: 0.3 } });
    st = r.B.last("match_state").payload.state;
    assert.deepEqual([st.turn === first, st.restNx, st.awaitingRest], [false, 0.3, null]);
  } finally { clock.restore(); }
});

test("a late rest is passed on by the server, and nobody is stuck", async () => {
  const clock = clockAndTimers();
  try {
    const r = startRoom("t21");
    await readyBoth(r, clock);
    const first = r.room.match.turn;
    const found = findMatchHand(r.room.match.seed, 0, true);
    await r.say({ a: r.A, b: r.B }[first], "match_event", { event: { type: "shot", shotId: 0, ...found.hand } });
    clock.advance(found.ticks * (1000 / 60) + 500);
    assert.equal(r.A.last("match_state").payload.state.awaitingRest, first);
    clock.advance(16_000);
    const st = r.B.last("match_state").payload.state;
    assert.deepEqual([st.awaitingRest, st.turn === first], [null, false]);
  } finally { clock.restore(); }
});

test("a player who is gone for good gives the match to the other", async () => {
  const clock = clockAndTimers();
  try {
    const r = startRoom("speed");
    await readyBoth(r, clock);
    r.hub.disconnect(r.B);
    assert.equal(r.A.last("peer_disconnected").payload.playerId, "b");
    clock.advance(14_000);
    assert.equal(r.room.match.over, null);
    clock.advance(2_000);
    const st = r.A.last("match_state").payload.state;
    assert.deepEqual(st.over, { winnerId: "a", reason: "lost the connection" });
  } finally { clock.restore(); }
});

test("a player who comes back in time gets the real state and keeps the match", async () => {
  const clock = clockAndTimers();
  try {
    const r = startRoom("speed");
    await readyBoth(r, clock);
    r.hub.disconnect(r.B);
    clock.advance(8_000);
    const back = new Socket();
    r.hub.connectRoom({ id: "b", nickname: "Bravo" }, r.code, back);
    assert.equal(back.last("match_state").payload.state.seq, r.room.match.seq);
    clock.advance(30_000);
    assert.equal(r.room.match.over, null);
  } finally { clock.restore(); }
});

test("an old app cannot connect to a protocol 3 room, and a new one can ask which protocol the server speaks", async () => {
  const { makeWorld } = await import("./helpers/api.mjs");
  const world = await makeWorld();
  const v = await world.call("GET", "/mp/version");
  assert.equal(v.json.protocol, "3");
  const hub = new MultiplayerHub({});
  const res = hub.connect(new Request("https://x/ws?mode=quick&game=speed", { headers: { "x-player-id": "a", "x-player-nickname": "Alpha" } }), new URL("https://x/ws?mode=quick&game=speed"));
  assert.equal(res.status, 426);
  const res2 = hub.connect(new Request("https://x/ws?mode=quick&game=speed&protocol=2", { headers: { "x-player-id": "a", "x-player-nickname": "Alpha" } }), new URL("https://x/ws?mode=quick&game=speed&protocol=2"));
  assert.equal(res2.status, 426);
});
