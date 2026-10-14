// An online match, kept by the server. The server knows whose turn it is, plays every shot itself, and tells both players the same score.
// A player's app only says "I shot the ball from here with this speed": where the hoop stood, whether it went in, how many points that is
// and who has won are all worked out here, with the same ball step the game uses.
import { TICK_MS, simulateShot } from "./replay.js";
import { isFar, matchCourt, shotProblem } from "./shots.js";

export const SPEED_GOAL = 10;
export const T21_GOAL = 21;
export const HORSE_LETTERS = 5;
/** After a shot in HORSE and 21 the shooter says where the ball stopped; if they do not, the server passes the turn on. */
export const REST_TIMEOUT_MS = 15_000;
export const MIN_SHOT_GAP_MS = 700;
/** A shot is decided when its flight has played out (plus a moment for the network); never later than this. */
const DECIDE_SLACK_MS = 120;
const MAX_FLIGHT_MS = 30_000;

const error = (code, message) => ({ ok: false, code, message });

/** A new match. `firstPlayerId` shoots first in HORSE and 21 (the server picks, the apps follow). */
export function createMatch({ game, seed, playerIds, firstPlayerId, now }) {
  const zero = () => Object.fromEntries(playerIds.map((id) => [id, 0]));
  return {
    game,
    seed,
    ids: [...playerIds],
    turn: game === "speed" ? null : firstPlayerId,
    scores: zero(),
    letters: zero(),
    streaks: zero(),
    /** Results so far: all of them in HORSE and 21, each player's own in Speedball (it gives the next hoop). */
    round: 0,
    rounds: zero(),
    shotCount: zero(),
    active: Object.fromEntries(playerIds.map((id) => [id, null])),
    lastShotAt: Object.fromEntries(playerIds.map((id) => [id, -Infinity])),
    awaitingRest: null,
    restDueAt: 0,
    restNx: 0.5,
    over: null,
    seq: 0,
    last: null,
    createdAt: now,
  };
}

/** What both players are told: the whole state, so a player who missed a message (or reconnects) is right again at once. */
export function snapshot(m) {
  return {
    seq: m.seq,
    game: m.game,
    turn: m.turn,
    scores: { ...m.scores },
    letters: { ...m.letters },
    streaks: { ...m.streaks },
    round: m.round,
    rounds: { ...m.rounds },
    active: Object.fromEntries(m.ids.map((id) => [id, m.active[id] ? m.active[id].shotId : null])),
    awaitingRest: m.awaitingRest,
    restNx: m.restNx,
    over: m.over,
    last: m.last,
  };
}

function bump(m, last) {
  m.seq++;
  m.last = last;
}

const otherOf = (m, id) => m.ids.find((x) => x !== id);

/** A player shoots. Returns { ok: true } (the result follows when the flight has played out) or { ok: false, code, message }. */
export function startShot(m, id, event, now) {
  if (m.over) return error("match_over", "The match is over.");
  if (!m.ids.includes(id)) return error("not_in_match", "You are not in this match.");
  if (m.active[id]) return error("shot_in_flight", "Your last shot is still on its way.");
  if (m.game !== "speed") {
    if (m.turn !== id) return error("wrong_turn", "It is not your turn.");
    if (m.awaitingRest) return error("wait_for_rest", "The turn has not been passed on yet.");
    if (m.ids.some((x) => m.active[x])) return error("shot_in_flight", "A shot is still on its way.");
  }
  if (!Number.isInteger(event?.shotId) || event.shotId !== m.shotCount[id]) return error("bad_shot_id", "That shot number is not the next one.");
  if (now - m.lastShotAt[id] < MIN_SHOT_GAP_MS) return error("too_fast", "Shots are too close together.");
  const problem = shotProblem(event);
  if (problem) return error("bad_shot", problem);

  const seedKey = m.game === "speed" ? `${m.seed}:${id}` : m.seed;
  const round = m.game === "speed" ? m.rounds[id] : m.round;
  const court = matchCourt(seedKey, round, event);
  const played = simulateShot(event, court.hoop, { maxTicks: Math.ceil(MAX_FLIGHT_MS / TICK_MS) });
  const flightMs = Math.min(MAX_FLIGHT_MS, played.tick * TICK_MS);
  m.active[id] = { shotId: event.shotId, at: now, dueAt: now + flightMs + DECIDE_SLACK_MS, goal: played.outcome === "goal", far: isFar(event, court.ringX) };
  m.shotCount[id]++;
  m.lastShotAt[id] = now;
  bump(m, { type: "shot", by: id, shotId: event.shotId });
  return { ok: true };
}

/** The shooter says where the ball stopped (HORSE and 21): the other player takes it from there. */
export function rest(m, id, event, now) {
  if (m.over) return error("match_over", "The match is over.");
  if (m.game === "speed") return error("bad_rest", "There is no rest in Speedball.");
  if (m.awaitingRest !== id) return error("bad_rest", "There is nothing to rest now.");
  const nx = event?.nx;
  if (typeof nx !== "number" || !Number.isFinite(nx) || nx < 0 || nx > 1) return error("bad_rest", "The rest position is invalid.");
  passTurn(m, id, nx);
  return { ok: true };
}

function passTurn(m, id, nx) {
  m.awaitingRest = null;
  m.restDueAt = 0;
  m.restNx = nx;
  if (!m.over) m.turn = otherOf(m, id);
  bump(m, { type: "rest", by: id, nx });
}

/** Decides every shot whose flight is over, and passes the turn on when a rest is late. Returns true when the state changed. */
export function advance(m, now) {
  if (m.over) return false;
  let changed = false;
  for (const id of m.ids) {
    const shot = m.active[id];
    if (!shot || now < shot.dueAt) continue;
    m.active[id] = null;
    decide(m, id, shot, now);
    changed = true;
    if (m.over) return true;
  }
  if (m.awaitingRest && now >= m.restDueAt) {
    passTurn(m, m.awaitingRest, 0.5);
    changed = true;
  }
  return changed;
}

function decide(m, id, shot, now) {
  const goal = shot.goal;
  m.round++;
  m.rounds[id]++;
  m.streaks[id] = goal ? m.streaks[id] + 1 : 0;
  const other = otherOf(m, id);
  if (m.game === "speed") {
    if (goal) m.scores[id]++;
    if (m.scores[id] >= SPEED_GOAL) m.over = { winnerId: id, reason: "got to 10 first" };
  } else if (m.game === "t21") {
    if (goal) m.scores[id] += shot.far ? 2 : 1;
    if (m.scores[id] >= T21_GOAL) m.over = { winnerId: id, reason: "got to 21 first" };
  } else if (!goal) {
    m.letters[id]++;
    if (m.letters[id] >= HORSE_LETTERS) m.over = { winnerId: other, reason: "spelled HORSE" };
  }
  bump(m, { type: "result", by: id, shotId: shot.shotId, goal, far: shot.far });
  if (m.game !== "speed" && !m.over) {
    m.awaitingRest = id;
    m.restDueAt = now + REST_TIMEOUT_MS;
  }
}

/** The time the next thing is due, so the room knows when to look again (null: nothing is waiting). */
export function nextDue(m) {
  if (m.over) return null;
  let due = Infinity;
  for (const id of m.ids) if (m.active[id]) due = Math.min(due, m.active[id].dueAt);
  if (m.awaitingRest) due = Math.min(due, m.restDueAt);
  return Number.isFinite(due) ? due : null;
}

/** A player leaves or is gone for good: the other one wins. */
export function forfeit(m, id, reason = "left the match") {
  if (m.over) return false;
  m.over = { winnerId: otherOf(m, id), reason };
  m.active = Object.fromEntries(m.ids.map((x) => [x, null]));
  m.awaitingRest = null;
  bump(m, { type: "over", by: id });
  return true;
}
