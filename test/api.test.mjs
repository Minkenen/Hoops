import test from "node:test";
import assert from "node:assert/strict";
import { makeWorld } from "./helpers/api.mjs";
import { buildReplay } from "./helpers/client.mjs";

async function session(world, token) {
  const r = await world.call("POST", "/replay/session", { token });
  assert.equal(r.status, 200);
  return r.json;
}

test("a session, a replay and a score: the counters come from the replay", async () => {
  const world = await makeWorld();
  const token = await world.addPlayer("p1", "Mia");
  const s = await session(world, token);
  const replay = buildReplay(s.sessionId, s.seed, [{ goal: true }, { goal: true }, { goal: false }, { goal: true }]);
  const up = await world.call("POST", "/replay", { token, body: replay });
  assert.equal(up.status, 200, JSON.stringify(up.json));
  assert.deepEqual([up.json.shots, up.json.goals, up.json.unconfirmed], [4, 3, 0]);
  const sc = await world.call("POST", "/score", { token, body: { replaySessionId: s.sessionId, score: 3, version: "0.1.24" } });
  assert.equal(sc.json.verified, true, JSON.stringify(sc.json));
  assert.deepEqual(sc.json.counters, { best_score: 3, best_streak: 2, throws: 4, goals: 3 });
});
