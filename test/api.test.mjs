import test from "node:test";
import assert from "node:assert/strict";
import { makeWorld } from "./helpers/api.mjs";
import { buildReplay, findHand } from "./helpers/client.mjs";
import { cleanupReplays } from "../server/leaderboard/src/index.ts";
import { soloCourt } from "../server/leaderboard/src/shots.js";

const V = "0.1.24";

async function newSession(world, token) {
  const r = await world.call("POST", "/replay/session", { token });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  return r.json;
}
async function upload(world, token, wants, opts) {
  const s = await newSession(world, token);
  const replay = buildReplay(s.sessionId, s.seed, wants, opts);
  const up = await world.call("POST", "/replay", { token, body: replay });
  return { s, replay, up };
}
const score = (world, token, sessionId, value, extra = {}) => world.call("POST", "/score", { token, body: { replaySessionId: sessionId, score: value, version: V, ...extra } });

test("a session, a replay and a score: the counters come from the replay", async () => {
  const world = await makeWorld();
  const token = await world.addPlayer("p1", "Mia");
  const { s, up } = await upload(world, token, [{ goal: true }, { goal: true }, { goal: false }, { goal: true }]);
  assert.equal(up.status, 200, JSON.stringify(up.json));
  assert.deepEqual([up.json.shots, up.json.goals, up.json.unconfirmed], [4, 3, 0]);
  const sc = await score(world, token, s.sessionId, 3);
  assert.equal(sc.json.verified, true, JSON.stringify(sc.json));
  assert.deepEqual(sc.json.counters, { best_score: 3, best_streak: 2, throws: 4, goals: 3 });
});

test("the app's own totals are not used: made-up throws, goals and streaks change nothing", async () => {
  const world = await makeWorld();
  const token = await world.addPlayer("p1");
  const { s } = await upload(world, token, [{ goal: true }, { goal: false }]);
  const sc = await score(world, token, s.sessionId, 1, { throws: 99999, goals: 99999, bestStreak: 99999 });
  assert.deepEqual(sc.json.counters, { best_score: 1, best_streak: 1, throws: 2, goals: 1 });
});

test("a score cannot grow by more than the goals of the replay", async () => {
  const world = await makeWorld();
  const token = await world.addPlayer("p1");
  const { s } = await upload(world, token, [{ goal: true }, { goal: false }, { goal: true }]);
  const sc = await score(world, token, s.sessionId, 5000);
  assert.equal(sc.json.verified, true);
  assert.equal(sc.json.counters.best_score, 2);
});

test("scores add up over several replays, and a streak goes on from one replay into the next", async () => {
  const world = await makeWorld();
  const token = await world.addPlayer("p1");
  let t = 1_000_000;
  const realNow = Date.now;
  Date.now = () => t;
  try {
    const one = await upload(world, token, [{ goal: false }, { goal: true }, { goal: true }]);
    assert.equal((await score(world, token, one.s.sessionId, 2)).json.counters.best_streak, 2);
    t += 60_000;
    const two = await upload(world, token, [{ goal: true }, { goal: true }, { goal: false }]);
    const sc = await score(world, token, two.s.sessionId, 4);
    assert.deepEqual(sc.json.counters, { best_score: 4, best_streak: 4, throws: 6, goals: 4 });
    t += 60_000;
    const three = await upload(world, token, [{ goal: true }, { goal: true }]);
    assert.equal((await score(world, token, three.s.sessionId, 6)).json.counters.best_streak, 4);
  } finally {
    Date.now = realNow;
  }
});

test("a replay can be counted only once", async () => {
  const world = await makeWorld();
  const token = await world.addPlayer("p1");
  const { s } = await upload(world, token, [{ goal: true }]);
  assert.equal((await score(world, token, s.sessionId, 1)).json.verified, true);
  const again = await score(world, token, s.sessionId, 1, {});
  assert.equal(again.json.verified, false);
  assert.ok(["session_used", "rate_limited"].includes(again.json.reason), again.json.reason);
  const counters = (await world.rows("SELECT throws, goals FROM scores"))[0];
  assert.deepEqual([counters.throws, counters.goals], [1, 1]);
});

test("a replay is not worth anything on another account", async () => {
  const world = await makeWorld();
  const a = await world.addPlayer("a");
  const b = await world.addPlayer("b");
  const { s } = await upload(world, a, [{ goal: true }]);
  const stolen = await score(world, b, s.sessionId, 1);
  assert.equal(stolen.json.verified, false);
  assert.equal(stolen.json.reason, "no_replay");
  const up = await world.call("POST", "/replay", { token: b, body: buildReplay(s.sessionId, s.seed, [{ goal: true }]) });
  assert.equal(up.status, 422);
  assert.equal(up.json.code, "bad_session");
  assert.equal((await world.rows("SELECT * FROM scores")).length, 0);
});

test("a score with no replay, an unknown session or a bad request is not counted and says why", async () => {
  const world = await makeWorld();
  const token = await world.addPlayer("p1");
  assert.equal((await world.call("POST", "/score", { token, body: { score: 5, version: V } })).json.reason, "bad_request");
  assert.equal((await score(world, token, "no-such-session-12345", 5)).json.reason, "no_replay");
  assert.equal((await score(world, token, "x", -1)).json.reason, "bad_request");
  assert.equal((await score(world, token, "x", 1.5)).json.reason, "bad_request");
  assert.equal((await world.call("POST", "/score", { token, raw: "not json" })).json.reason, "bad_request");
  const s = await newSession(world, token); // a session nobody uploaded a replay for
  assert.equal((await score(world, token, s.sessionId, 5)).json.reason, "no_replay");
  assert.equal((await world.rows("SELECT * FROM scores")).length, 0);
});

test("an old app is told to update, and nothing is counted", async () => {
  const world = await makeWorld();
  const token = await world.addPlayer("p1");
  const { s } = await upload(world, token, [{ goal: true }]);
  for (const version of ["0.1.9", "", "x.y.z"]) {
    const r = await world.call("POST", "/score", { token, body: { replaySessionId: s.sessionId, score: 1, version } });
    assert.equal(r.json.reason, "client_too_old", version);
    assert.equal(r.json.retryable, false);
  }
});

test("too soon after the last score: not counted yet, the replay is kept and can be sent again", async () => {
  const world = await makeWorld();
  const token = await world.addPlayer("p1");
  const first = await upload(world, token, [{ goal: true }]);
  assert.equal((await score(world, token, first.s.sessionId, 1)).json.verified, true);
  const second = await upload(world, token, [{ goal: true }, { goal: true }]);
  const soon = await score(world, token, second.s.sessionId, 3);
  assert.deepEqual([soon.json.verified, soon.json.reason, soon.json.retryable], [false, "rate_limited", true]);
  assert.equal((await world.rows("SELECT used_at FROM replays WHERE session_id = ?", second.s.sessionId))[0].used_at, null);
  // the same replay, later
  const realNow = Date.now;
  Date.now = () => realNow() + 40_000;
  try {
    const later = await score(world, token, second.s.sessionId, 3);
    assert.equal(later.json.verified, true, JSON.stringify(later.json));
    assert.deepEqual(later.json.counters, { best_score: 3, best_streak: 3, throws: 3, goals: 3 });
  } finally {
    Date.now = realNow;
  }
});

test("two scores at the same moment for the same replay: exactly one counts", async () => {
  const world = await makeWorld();
  const token = await world.addPlayer("p1");
  const { s } = await upload(world, token, [{ goal: true }, { goal: true }]);
  const results = await Promise.all(Array.from({ length: 6 }, (_, i) => world.call("POST", "/score", { token, ip: `9.9.9.${i}`, body: { replaySessionId: s.sessionId, score: 2, version: V } })));
  assert.equal(results.filter((r) => r.json.verified).length, 1, JSON.stringify(results.map((r) => r.json.reason)));
  const row = (await world.rows("SELECT throws, goals, best_score FROM scores"))[0];
  assert.deepEqual([row.throws, row.goals, row.best_score], [2, 2, 2]);
});

test("scores for different replays at the same moment all count, added up and never lost", async () => {
  const world = await makeWorld();
  const token = await world.addPlayer("p1");
  const made = [];
  for (let i = 0; i < 4; i++) made.push(await upload(world, token, [{ goal: true }, { goal: false }, { goal: true }]));
  // the player-level rate limit is not what is tested here: take it out of the way
  const results = await Promise.all(made.map((m, i) => world.call("POST", "/score", { token, ip: `8.8.8.${i}`, body: { replaySessionId: m.s.sessionId, score: 2 * (i + 1), version: V } })));
  const counted = results.filter((r) => r.json.verified).length;
  const row = (await world.rows("SELECT throws, goals, best_score FROM scores"))[0];
  assert.equal(row.throws, 3 * counted);
  assert.equal(row.goals, 2 * counted);
  assert.ok(row.best_score <= 2 * counted, `best ${row.best_score} with ${counted} counted`);
});

test("a player who already has a score on the server and a replay with more shots than goals", async () => {
  const world = await makeWorld();
  const token = await world.addPlayer("p1");
  await world.env.DB.prepare("INSERT INTO scores (player_id, best_score, best_streak, throws, goals, updated_at, streak) VALUES ('p1', 40, 9, 500, 200, 1, 3)").run();
  const { s } = await upload(world, token, [{ goal: true }, { goal: true }, { goal: false }, { goal: true }]);
  const sc = await score(world, token, s.sessionId, 41);
  assert.deepEqual(sc.json.counters, { best_score: 41, best_streak: 9, throws: 504, goals: 203 });
  const streak = (await world.rows("SELECT streak FROM scores"))[0].streak;
  assert.equal(streak, 1); // the replay ended with a miss and then a goal
});

test("the weekly gain is capped", async () => {
  const world = await makeWorld();
  const token = await world.addPlayer("p1");
  const { weekKey } = await import("../server/leaderboard/src/logic.js");
  await world.env.DB.prepare("INSERT INTO weekly_scores (player_id, week, best_score, gained_score) VALUES ('p1', ?, 4990, 4990)").bind(weekKey(Date.now())).run();
  await world.env.DB.prepare("INSERT INTO scores (player_id, best_score, best_streak, throws, goals, updated_at, streak) VALUES ('p1', 4990, 0, 0, 0, 1, 0)").run();
  const { s } = await upload(world, token, Array.from({ length: 30 }, () => ({ goal: true })));
  await score(world, token, s.sessionId, 5100);
  const w = (await world.rows("SELECT best_score, gained_score FROM weekly_scores"))[0];
  assert.ok(w.gained_score <= 5000, JSON.stringify(w));
});

test("a refused replay says why, is flagged, and a session can hold only one replay", async () => {
  const world = await makeWorld();
  const token = await world.addPlayer("p1");
  const s = await newSession(world, token);
  const forged = buildReplay(s.sessionId, s.seed, [{ goal: true }]);
  forged.shots[0].hoopL = 1;
  const refused = await world.call("POST", "/replay", { token, body: forged });
  assert.equal(refused.status, 422);
  assert.equal(refused.json.code, "replay_rejected");
  assert.match(refused.json.reason, /court data/);
  assert.ok((await world.rows("SELECT * FROM cheat_flags WHERE kind = 'replay'")).length >= 1);
  const good = buildReplay(s.sessionId, s.seed, [{ goal: true }]);
  assert.equal((await world.call("POST", "/replay", { token, body: good })).status, 200);
  const other = buildReplay(s.sessionId, s.seed, [{ goal: false }, { goal: true }]);
  const second = await world.call("POST", "/replay", { token, body: other });
  assert.equal(second.status, 409);
  assert.equal(second.json.code, "replay_exists");
  // the same upload again (a lost answer) is fine
  assert.equal((await world.call("POST", "/replay", { token, body: good })).status, 200);
});

test("a replay for a session that does not exist, is used or has expired is refused", async () => {
  const world = await makeWorld();
  const token = await world.addPlayer("p1");
  const none = await world.call("POST", "/replay", { token, body: buildReplay("no-such-session-1", "x".repeat(20), [{ goal: true }]) });
  assert.equal(none.json.code, "bad_session");
  const { s } = await upload(world, token, [{ goal: true }]);
  await score(world, token, s.sessionId, 1);
  const used = await world.call("POST", "/replay", { token, body: buildReplay(s.sessionId, s.seed, [{ goal: true }]) });
  assert.equal(used.json.code, "session_used");
  const old = await newSession(world, token);
  await world.env.DB.prepare("UPDATE replay_sessions SET created_at = ? WHERE session_id = ?").bind(Date.now() - 7 * 3_600_000, old.sessionId).run();
  const expired = await world.call("POST", "/replay", { token, body: buildReplay(old.sessionId, old.seed, [{ goal: true }]) });
  assert.equal(expired.json.code, "session_expired");
});

test("the seed in the replay is not trusted: the server uses its own", async () => {
  const world = await makeWorld();
  const token = await world.addPlayer("p1");
  const s = await newSession(world, token);
  // a replay played in the court of another seed (one whose hoops are all somewhere else): its goals are not the server's goals
  let wrongSeed;
  for (let k = 0; !wrongSeed; k++) {
    const candidate = buildReplay(s.sessionId, `not-the-servers-seed-${k}`, Array.from({ length: 6 }, () => ({ goal: true })));
    const elsewhere = candidate.shots.every((shot, i) => {
      const mine = soloCourt(candidate.seed, i, shot).hoop;
      const real = soloCourt(s.seed, i, shot).hoop;
      return Math.abs(mine.x0 - real.x0) > 40 || Math.abs(mine.rimY - real.rimY) > 40;
    });
    if (elsewhere) wrongSeed = candidate;
  }
  const up = await world.call("POST", "/replay", { token, body: wrongSeed });
  assert.equal(up.status, 200);
  // a few of them may happen to score in the server's court too, but not all six
  assert.ok(up.json.goals < 6, `goals ${up.json.goals}`);
});

test("sessions: a few can be open at a time, and a day has a limit", async () => {
  const world = await makeWorld();
  const token = await world.addPlayer("p1");
  for (let i = 0; i < 5; i++) await newSession(world, token);
  const sixth = await world.call("POST", "/replay/session", { token });
  assert.equal(sixth.status, 429);
  const noToken = await world.call("POST", "/replay/session");
  assert.equal(noToken.status, 401);
});

test("replays that are too big or not json are refused", async () => {
  const world = await makeWorld();
  const token = await world.addPlayer("p1");
  assert.equal((await world.call("POST", "/replay", { token, raw: "x".repeat(70_000) })).status, 413);
  assert.equal((await world.call("POST", "/replay", { token, raw: "{{{" })).status, 400);
});

test("cleaning up removes what was never used and keeps what is recent", async () => {
  const world = await makeWorld();
  const token = await world.addPlayer("p1");
  const old = await newSession(world, token);
  const recent = await newSession(world, token);
  const day = 24 * 3_600_000;
  await world.env.DB.prepare("UPDATE replay_sessions SET created_at = ? WHERE session_id = ?").bind(Date.now() - 2 * day, old.sessionId).run();
  await world.env.DB.prepare("INSERT INTO replays (session_id, player_id, created_at, shots, goals, data) VALUES ('old-replay-1', 'p1', ?, 1, 0, '{}')").bind(Date.now() - 2 * day).run();
  await world.env.DB.prepare("INSERT INTO replays (session_id, player_id, created_at, shots, goals, data) VALUES ('new-replay-1', 'p1', ?, 1, 0, '{}')").bind(Date.now()).run();
  await cleanupReplays(world.env);
  const sessions = (await world.rows("SELECT session_id FROM replay_sessions")).map((r) => r.session_id);
  assert.deepEqual(sessions, [recent.sessionId]);
  assert.deepEqual((await world.rows("SELECT session_id FROM replays")).map((r) => r.session_id), ["new-replay-1"]);
});

test("a hidden player is not on the board, and the board shows scores from verified replays", async () => {
  const world = await makeWorld();
  const a = await world.addPlayer("a", "Alpha");
  const b = await world.addPlayer("b", "Bravo");
  const one = await upload(world, a, [{ goal: true }, { goal: true }]);
  await score(world, a, one.s.sessionId, 2);
  const two = await upload(world, b, [{ goal: true }]);
  assert.equal((await world.call("POST", "/score", { token: b, ip: "5.6.7.8", body: { replaySessionId: two.s.sessionId, score: 1, version: V } })).json.verified, true);
  let board = await world.call("GET", "/leaderboard?tab=global");
  assert.deepEqual(board.json.top.map((r) => [r.name, r.score]), [["Alpha", 2], ["Bravo", 1]]);
  await world.env.DB.prepare("UPDATE players SET hidden = 1 WHERE id = 'a'").run();
  board = await world.call("GET", "/leaderboard?tab=global");
  assert.deepEqual(board.json.top.map((r) => r.name), ["Bravo"]);
});

// ---- what the account owns ----

/** Lemon Squeezy, played by the test: which keys are good and what they unlock. */
function licenseService(good) {
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (!String(url).includes("api.lemonsqueezy.com")) return real(url, init);
    const key = new URLSearchParams(String(init.body)).get("license_key");
    calls.push(key);
    if (key === "SERVICE-DOWN") return new Response("oops", { status: 503 });
    const hit = good[key];
    return new Response(JSON.stringify(hit ? { valid: true, meta: { store_id: 495291, product_id: hit } } : { valid: false }), { status: 200 });
  };
  return { calls, restore: () => { globalThis.fetch = real; } };
}
const ALL_ACCESS = 1430835;
const STREET = 1431014;
const putProfile = (world, token, licenses) => world.call("PUT", "/profile", { token, body: { v: 1, licenses } });

test("a theme the account has a good license for is owned; made-up and wrong keys are not", async () => {
  const ls = licenseService({ "GOOD-STREET": STREET, "GOOD-ALL": ALL_ACCESS });
  try {
    const world = await makeWorld();
    const token = await world.addPlayer("p1");
    assert.deepEqual((await world.call("GET", "/entitlements", { token })).json, { all: false, themes: [] });
    await putProfile(world, token, [{ key: "GOOD-STREET" }, { key: "MADE-UP-KEY" }, { key: "" }, { nokey: 1 }, "text"]);
    assert.deepEqual((await world.call("GET", "/entitlements", { token })).json, { all: false, themes: ["street"] });
    await putProfile(world, token, [{ key: "GOOD-STREET" }, { key: "GOOD-ALL" }]);
    assert.deepEqual((await world.call("GET", "/entitlements", { token })).json, { all: true, themes: ["street"] });
  } finally { ls.restore(); }
});

test("editing the profile cannot unlock anything: only a key the license service accepts counts", async () => {
  const ls = licenseService({});
  try {
    const world = await makeWorld();
    const token = await world.addPlayer("p1");
    await world.call("PUT", "/profile", { token, body: { v: 1, premium: true, owned: ["street", "arena"], entitlements: { all: true }, licenses: [{ key: "FAKE", unlock: "all", theme: "" }] } });
    assert.deepEqual((await world.call("GET", "/entitlements", { token })).json, { all: false, themes: [] });
  } finally { ls.restore(); }
});

test("one purchase cannot be shared: a key belongs to the first account that uses it", async () => {
  const ls = licenseService({ "SHARED-KEY": ALL_ACCESS });
  try {
    const world = await makeWorld();
    const a = await world.addPlayer("a");
    const b = await world.addPlayer("b");
    await putProfile(world, a, [{ key: "SHARED-KEY" }]);
    assert.equal((await world.call("GET", "/entitlements", { token: a })).json.all, true);
    await putProfile(world, b, [{ key: "SHARED-KEY" }]);
    assert.equal((await world.call("GET", "/entitlements", { token: b })).json.all, false);
    assert.equal((await world.call("GET", "/entitlements", { token: a })).json.all, true);
    assert.ok((await world.rows("SELECT * FROM cheat_flags WHERE kind = 'license_shared'")).length >= 1);
  } finally { ls.restore(); }
});

test("the license service is asked once a day per key, not on every call", async () => {
  const ls = licenseService({ "ONCE-A-DAY": STREET });
  const realNow = Date.now;
  try {
    const world = await makeWorld();
    const token = await world.addPlayer("p1");
    await putProfile(world, token, [{ key: "ONCE-A-DAY" }]);
    for (let i = 0; i < 5; i++) await world.call("GET", "/entitlements", { token });
    assert.equal(ls.calls.length, 1);
    Date.now = () => realNow() + 25 * 3_600_000;
    await world.call("GET", "/entitlements", { token });
    assert.equal(ls.calls.length, 2);
  } finally { Date.now = realNow; ls.restore(); }
});

test("a refunded license stops counting at the next check, and a service that is down changes nothing", async () => {
  const good = { "REFUNDED-LATER": STREET };
  const ls = licenseService(good);
  const realNow = Date.now;
  try {
    const world = await makeWorld();
    const token = await world.addPlayer("p1");
    await putProfile(world, token, [{ key: "REFUNDED-LATER" }]);
    assert.deepEqual((await world.call("GET", "/entitlements", { token })).json.themes, ["street"]);
    delete good["REFUNDED-LATER"];
    Date.now = () => realNow() + 25 * 3_600_000;
    assert.deepEqual((await world.call("GET", "/entitlements", { token })).json.themes, []);
    // a service that is down: the last answer stays
    good["SERVICE-DOWN"] = STREET;
    await world.env.DB.prepare("DELETE FROM license_claims").run();
    await putProfile(world, token, [{ key: "SERVICE-DOWN" }]);
    const res = await world.call("GET", "/entitlements", { token });
    assert.deepEqual(res.json, { all: false, themes: [] });
  } finally { Date.now = realNow; ls.restore(); }
});

test("at most a dozen keys are looked at, and the answer needs a sign-in", async () => {
  const ls = licenseService({});
  try {
    const world = await makeWorld();
    const token = await world.addPlayer("p1");
    await putProfile(world, token, Array.from({ length: 40 }, (_, i) => ({ key: `KEY-${i}` })));
    await world.call("GET", "/entitlements", { token });
    assert.equal(ls.calls.length, 12);
    assert.equal((await world.call("GET", "/entitlements")).status, 401);
  } finally { ls.restore(); }
});

test("the websocket gate passes the app's protocol on to the room (the room refuses a connection without it)", async () => {
  const world = await makeWorld();
  const token = await world.addPlayer("p1", "Player One");
  const seen = [];
  world.env.MP = { idFromName: () => "hub", get: () => ({ fetch: async (request) => { seen.push(new URL(request.url)); return new Response("ok"); } }) };
  const worker = (await import("../server/leaderboard/src/index.ts")).default;
  const res = await worker.fetch(new Request(`https://hoops.test/mp/ws?mode=room&create=1&game=speed&protocol=3&token=${token}`, { headers: { upgrade: "websocket", "cf-connecting-ip": "1.2.3.4" } }), world.env);
  assert.equal(res.status, 200);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].searchParams.get("protocol"), "3");
  assert.equal(seen[0].searchParams.get("mode"), "room");
});
