import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';

globalThis.window = { setInterval: () => 0, clearInterval() {}, clearTimeout() {} };
const source = readFileSync(new URL('../src/onlineMatch.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { OnlineMatch } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

for (const game of ['horse', 't21']) test(`${game}: one owner until rest, separate streaks, stale packets and sounds`, () => {
  const endpoints = [{}, {}];
  const events = [[], []];
  const queue = [];
  const players = endpoints.map((ep, i) => new OnlineMatch({
    game, court: 'Street', opponent: 'Opponent', seed: 'test', myId: String(i), peerId: String(1 - i),
  }, {
    setHandlers(h) { ep.handlers = h; },
    sendPeer(type, payload) { queue.push(() => endpoints[1 - i].handlers.onDirectMessage({ type, payload })); },
  }, {
    changed() {}, toast() {}, peerShotStarted() {}, peerShotEnded() {},
    peerRest(nx) { events[i].push(['rest', nx]); },
    ball(p) { events[i].push(['ball', p.nx]); },
    peerSound(name) { events[i].push(['sound', name]); },
  }));
  const flush = () => { while (queue.length) queue.shift()(); };
  const first = players.findIndex(p => p.turn === 'me');
  for (let round = 0; round < 6; round++) {
    const i = round % 2 ? 1 - first : first;
    const owner = players[i], viewer = players[1 - i];
    assert.equal(owner.canShoot(), true);
    assert.equal(viewer.canShoot(), false);
    owner.localShot(); flush();
    owner.localResult(true); flush();
    assert.equal(owner.turn, 'me');
    assert.equal(viewer.turn, 'opp');
    assert.equal(owner.canShoot(), false);
    assert.equal(viewer.canShoot(), false);
    owner.sendBall({ kind: 'free', nx: .7, ny: .8, ang: 0 });
    owner.sendSound('bounce', .6); flush();
    assert.deepEqual(events[1 - i].at(-1), ['sound', 'bounce']);
    owner.sendRest(.7); flush();
    assert.equal(viewer.canShoot(), true);
    const n = events[1 - i].length;
    owner.sendBall({ kind: 'free', nx: .1, ny: .2, ang: 0 }); flush();
    assert.equal(events[1 - i].length, n);
    assert.equal(owner.streakMe, viewer.streakOpp);
  }
  assert.equal(players[0].streakMe, 3);
  assert.equal(players[1].streakMe, 3);
  const owner = players.find(p => p.canShoot());
  owner.localShot(); flush(); owner.localResult(false); flush(); owner.sendRest(.4); flush();
  assert.equal(owner.streakMe, 0);
  assert.equal(owner.streakOpp, 3);
});
