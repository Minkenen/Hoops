// The app's side of a match: it follows the server's state, ignores what the other player sends straight to it, and never gets stuck.
import test from "node:test";
import assert from "node:assert/strict";

globalThis.window = { setInterval: () => 1, clearInterval: () => {}, setTimeout: () => 1, clearTimeout: () => {} };
const { OnlineMatch } = await import("../src/onlineMatch.ts");

const ME = "me-id";
const PEER = "peer-id";

function setup(game = "horse", firstPlayerId = ME) {
  const sent = [];
  const peerSent = [];
  let handlers = null;
  const conn = {
    setHandlers: (h) => { handlers = h; },
    send: (type, payload) => sent.push({ type, payload }),
    sendPeer: (type, payload) => peerSent.push({ type, payload }),
    close: () => {},
  };
  const calls = [];
  const host = {
    changed: () => calls.push(["changed"]),
    toast: (m) => calls.push(["toast", m]),
    peerRest: (nx) => calls.push(["peerRest", nx]),
    ball: (p) => calls.push(["ball", p]),
    peerShotStarted: () => calls.push(["peerShotStarted"]),
    peerShotEnded: (goal) => calls.push(["peerShotEnded", goal]),
    peerSound: (n, i) => calls.push(["sound", n, i]),
  };
  const m = new OnlineMatch({ game, court: "Street", opponent: "Bravo", seed: "room-seed-12345", myId: ME, peerId: PEER, firstPlayerId }, conn, host);
  const state = (over = {}) => ({
    seq: 1, game, turn: game === "speed" ? null : firstPlayerId, scores: { [ME]: 0, [PEER]: 0 }, letters: { [ME]: 0, [PEER]: 0 }, streaks: { [ME]: 0, [PEER]: 0 },
    round: 0, rounds: { [ME]: 0, [PEER]: 0 }, active: { [ME]: null, [PEER]: null }, awaitingRest: null, restNx: 0.5, over: null, last: null, ...over,
  });
  const push = (st) => handlers.onMessage({ type: "match_state", payload: { state: st } });
  return { m, sent, peerSent, calls, handlers: () => handlers, state, push };
}

const hand = { artW: 800, artH: 500, floorY: 452, x: 300, y: 441.5, vx: 2, vy: -6, gs: 0.8 };

test("the first player comes from the server", () => {
  assert.equal(setup("horse", ME).m.turn, "me");
  assert.equal(setup("horse", PEER).m.turn, "opp");
  assert.equal(setup("speed", null).m.turn, "both");
  for (const [first, expected] of [[ME, "me"], [PEER, "opp"]]) {
    for (const game of ["horse", "t21"]) assert.equal(setup(game, first).m.turn, expected);
  }
});

test("a shot sends only what the hand did: no court, no result, no score", () => {
  const { m, sent } = setup("speed", null);
  m.localShot(hand);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].type, "match_event");
  assert.deepEqual(sent[0].payload, { event: { type: "shot", shotId: 0, ...hand } });
  assert.deepEqual(Object.keys(sent[0].payload.event).sort(), ["artH", "artW", "floorY", "gs", "shotId", "type", "vx", "vy", "x", "y"]);
  m.localResult(true, true); // what this screen saw: it sends nothing
  assert.equal(sent.length, 1);
});

test("the score, the letters, the streaks and the rounds are the server's", () => {
  const { m, push, state } = setup("t21");
  push(state({ seq: 5, scores: { [ME]: 7, [PEER]: 12 }, letters: { [ME]: 2, [PEER]: 1 }, streaks: { [ME]: 3, [PEER]: 0 }, round: 9, rounds: { [ME]: 4, [PEER]: 5 } }));
  assert.deepEqual([m.scoreMe, m.scoreOpp, m.lettersMe, m.lettersOpp, m.streakMe, m.streakOpp, m.round, m.localRound], [7, 12, 2, 1, 3, 0, 9, 4]);
});

test("an old state is ignored", () => {
  const { m, push, state } = setup("t21");
  push(state({ seq: 10, scores: { [ME]: 5, [PEER]: 0 } }));
  push(state({ seq: 9, scores: { [ME]: 1, [PEER]: 0 } }));
  push(state({ seq: 10, scores: { [ME]: 2, [PEER]: 0 } }));
  assert.equal(m.scoreMe, 5);
});

test("whose turn it is, and whether I can shoot, follow the state", () => {
  const { m, push, state } = setup("horse", ME);
  assert.equal(m.canShoot(), true);
  m.localShot(hand);
  assert.equal(m.canShoot(), false); // my shot is in the air
  push(state({ seq: 2, active: { [ME]: 0, [PEER]: null }, last: { type: "shot", by: ME, shotId: 0 } }));
  assert.equal(m.canShoot(), false);
  push(state({ seq: 3, awaitingRest: ME, round: 1, last: { type: "result", by: ME, shotId: 0, goal: false, far: false } }));
  assert.equal(m.canShoot(), false); // the turn is not yet passed on
  m.sendRest(0.4);
  push(state({ seq: 4, turn: PEER, round: 1, restNx: 0.4, last: { type: "rest", by: ME, nx: 0.4 } }));
  assert.equal(m.turn, "opp");
  assert.equal(m.canShoot(), false);
  push(state({ seq: 5, turn: PEER, active: { [ME]: null, [PEER]: 0 }, last: { type: "shot", by: PEER, shotId: 0 } }));
  push(state({ seq: 6, turn: PEER, awaitingRest: PEER, round: 2, last: { type: "result", by: PEER, shotId: 0, goal: true, far: false } }));
  assert.equal(m.waitingForPeer, true);
  push(state({ seq: 7, turn: ME, round: 2, restNx: 0.7, last: { type: "rest", by: PEER, nx: 0.7 } }));
  assert.equal(m.turn, "me");
  assert.equal(m.waitingForPeer, false);
  assert.equal(m.canShoot(), true);
});

test("the other player's shot, result and rest show up on this screen", () => {
  const { m, push, state, calls } = setup("horse", PEER);
  push(state({ seq: 2, turn: PEER, active: { [ME]: null, [PEER]: 0 }, last: { type: "shot", by: PEER, shotId: 0 } }));
  assert.ok(calls.some((c) => c[0] === "peerShotStarted"));
  push(state({ seq: 3, turn: PEER, awaitingRest: PEER, round: 1, last: { type: "result", by: PEER, shotId: 0, goal: true, far: false } }));
  assert.deepEqual(calls.filter((c) => c[0] === "peerShotEnded"), [["peerShotEnded", true]]);
  assert.ok(calls.some((c) => c[0] === "toast" && /Bravo scored/.test(c[1])));
  push(state({ seq: 4, turn: ME, round: 1, restNx: 0.25, last: { type: "rest", by: PEER, nx: 0.25 } }));
  assert.deepEqual(calls.filter((c) => c[0] === "peerRest"), [["peerRest", 0.25]]);
  assert.equal(m.turn, "me");
});

test("a state that skips events (a missed message) still ends in the right place", () => {
  const { m, push, state, calls } = setup("horse", PEER);
  // the shot, the result and the rest all in one jump
  push(state({ seq: 9, turn: ME, round: 1, restNx: 0.6, last: { type: "rest", by: PEER, nx: 0.6 } }));
  assert.equal(m.turn, "me");
  assert.equal(m.canShoot(), true);
  assert.equal(calls.filter((c) => c[0] === "peerRest").length, 0, "no rest to show if the waiting was never seen");
});

test("direct shot, result and rest do nothing; ball and sound still work", () => {
  const { m, state, push, handlers, calls } = setup("horse", PEER);
  push(state({ seq: 1, turn: PEER }));
  const before = JSON.stringify([m.scoreMe, m.scoreOpp, m.lettersMe, m.lettersOpp, m.round, m.turn, m.over]);
  const direct = handlers().onDirectMessage;
  direct({ type: "result", payload: { shotId: 0, goal: true, far: true, score: 99, letters: 0 } });
  direct({ type: "shot", payload: { shotId: 0 } });
  direct({ type: "rest", payload: { nx: 0.1 } });
  direct({ type: "result", shotId: 0, goal: true, score: 99 });
  direct({ type: "match_state", payload: { state: state({ seq: 99, scores: { [ME]: 99, [PEER]: 0 } }) } });
  assert.equal(JSON.stringify([m.scoreMe, m.scoreOpp, m.lettersMe, m.lettersOpp, m.round, m.turn, m.over]), before);
  assert.equal(calls.filter((c) => ["peerShotStarted", "peerShotEnded", "peerRest"].includes(c[0])).length, 0);
  direct({ type: "ball", payload: { kind: "free", nx: 0.5, ang: 0 } });
  assert.ok(calls.some((c) => c[0] === "ball"));
  direct({ type: "sound", payload: { name: "rim", intensity: 0.5 } });
  assert.ok(calls.some((c) => c[0] === "sound"));
});

test("the end of a match, as each player reads it", () => {
  const cases = [
    ["speed", { winnerId: ME, reason: "got to 10 first" }, [true, "You got to 10 first"]],
    ["speed", { winnerId: PEER, reason: "got to 10 first" }, [false, "Bravo got to 10 first"]],
    ["t21", { winnerId: ME, reason: "got to 21 first" }, [true, "You got to 21 first"]],
    ["horse", { winnerId: ME, reason: "spelled HORSE" }, [true, "Bravo spelled HORSE"]],
    ["horse", { winnerId: PEER, reason: "spelled HORSE" }, [false, "You spelled HORSE"]],
    ["horse", { winnerId: ME, reason: "left the match" }, [true, "Bravo left the match"]],
    ["horse", { winnerId: ME, reason: "lost the connection" }, [true, "Bravo lost the connection"]],
  ];
  for (const [game, over, [won, reason]] of cases) {
    const { m, push, state } = setup(game, ME);
    push(state({ seq: 2, over }));
    assert.deepEqual(m.over, { won, reason }, `${game} ${over.reason}`);
    assert.equal(m.canShoot(), false);
  }
});

test("a server error never leaves the app stuck: the shot is given up and the real state follows", () => {
  const { m, handlers, push, state, calls } = setup("horse", ME);
  m.localShot(hand);
  assert.equal(m.canShoot(), false);
  handlers().onMessage({ type: "error", payload: { code: "bad_shot", message: "Shot speed is impossible.", shotId: 0 } });
  assert.ok(calls.some((c) => c[0] === "toast" && /impossible/.test(c[1])));
  push(state({ seq: 3 })); // the server's real state, nothing in the air
  assert.equal(m.canShoot(), true);
});

test("a late rest is sent once, and again if the server refused it", () => {
  const { m, sent, handlers, push, state } = setup("t21", ME);
  m.sendRest(0.3); // nothing to rest yet
  assert.equal(sent.length, 0);
  m.localShot(hand);
  push(state({ seq: 2, awaitingRest: ME, round: 1, last: { type: "result", by: ME, shotId: 0, goal: false, far: false } }));
  m.sendRest(0.3);
  m.sendRest(0.3);
  assert.equal(sent.filter((s) => s.payload.event.type === "rest").length, 1);
  handlers().onMessage({ type: "error", payload: { code: "bad_rest", message: "The rest position is invalid." } });
  m.sendRest(0.3);
  assert.equal(sent.filter((s) => s.payload.event.type === "rest").length, 2);
});

test("the other player leaving, or the connection dropping, ends the match", () => {
  const a = setup("speed", null);
  a.handlers().onMessage({ type: "peer_left", payload: { playerId: PEER } });
  assert.deepEqual(a.m.over, { won: true, reason: "Bravo left the match" });
  const b = setup("speed", null);
  b.handlers().onClose();
  assert.equal(b.m.over.won, false);
  const c = setup("speed", null);
  c.handlers().onMessage({ type: "peer_disconnected", payload: {} });
  assert.equal(c.m.peerAway, true);
  c.handlers().onMessage({ type: "peer_reconnected", payload: {} });
  assert.equal(c.m.peerAway, false);
});

test("leaving tells the other player and closes everything", () => {
  const { m, peerSent, sent } = setup("speed", null);
  m.leave();
  assert.ok(peerSent.some((p) => p.type === "leave"));
  assert.ok(sent.some((s) => s.type === "bye"));
});
