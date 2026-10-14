// Plays a player's solo shots again on the server.
// The server does not take anything about the court from the player: where the hoop stood follows from the server's seed and the shot's number,
// and the ball moves with the same step the game uses (shared/world.ts). A goal counts only if the replay of the shot is a goal too.
import { stepWorld } from "../../../shared/world.ts";
import { shotProblem, soloCourt } from "./shots.js";

export const MAX_SHOTS = 200;
export const MAX_REPLAY_BYTES = 64_000;
export const MIN_SHOT_GAP_MS = 700;
const MAX_FLIGHT_MS = 30_000;
/** The game steps 60 times a second, 4 sub-steps of 0.3125 each. */
export const TICK_MS = 1000 / 60;
const SUB_STEPS = 4;
const SUB_DT = 0.25 * 1.25;
const MAX_TICKS = 1800;
/** A goal is accepted when the replay scores within this many milliseconds of when the game said it did. */
const TIME_SLACK_MS = 150;
const TIME_SLACK_FRACTION = 0.15;

const SHOT_FIELDS = ["id", "t", "resultT", "artW", "artH", "floorY", "x", "y", "vx", "vy", "gs", "goal", "void"];

/**
 * Plays one shot from the hand until it is decided: the first of a goal, the ball falling past the net, or a hard bounce on the floor.
 * Returns { outcome: "goal" | "miss" | "open", tick, hits }.
 */
export function simulateShot(shot, hoop, limits = {}) {
  const maxTicks = Math.min(MAX_TICKS, limits.maxTicks ?? MAX_TICKS);
  const ball = { x: shot.x, y: shot.y, vx: shot.vx, vy: shot.vy, t: 0, gs: shot.gs, ang: 0, scored: false, noScore: false };
  let outcome = "open";
  let tick = 0;
  let hits = 0;
  let bounces = 0;
  const hooks = {
    hit: () => { hits++; },
    goal: () => { if (outcome === "open") { outcome = "goal"; ball.scored = true; } },
    fell: () => { if (outcome === "open") outcome = "miss"; },
    floorBounce: () => { if (outcome === "open" && !ball.scored) outcome = "miss"; },
  };
  for (tick = 1; tick <= maxTicks && outcome === "open"; tick++) {
    for (let k = 0; k < SUB_STEPS && outcome === "open"; k++) {
      const r = stepWorld(ball, { dt: SUB_DT, floorY: shot.floorY, artW: shot.artW, hoop, bounces, hooks });
      bounces = r.bounces;
    }
  }
  return { outcome, tick: outcome === "open" ? tick : tick - 1, hits };
}

const bad = (reason) => ({ ok: false, reason });
const finite = (v) => typeof v === "number" && Number.isFinite(v);

/**
 * Checks a replay against the session it belongs to.
 * `seed` is the one the server issued for the session (never the one in the payload).
 * Returns { ok, reason } or { ok: true, throws, goals, outcomes, unconfirmed, voided, suspicion }.
 */
export function verifyReplay(input, seed) {
  if (!input || typeof input !== "object") return bad("Invalid replay.");
  if (typeof input.sessionId !== "string" || !/^[a-zA-Z0-9_-]{8,80}$/.test(input.sessionId)) return bad("Invalid replay session.");
  if (typeof seed !== "string" || seed.length < 8 || seed.length > 80) return bad("Invalid replay seed.");
  if (!Array.isArray(input.shots) || input.shots.length < 1 || input.shots.length > MAX_SHOTS) return bad("Invalid replay shots.");
  let previousTime = -1;
  let unconfirmed = 0;
  let claimedGoals = 0;
  let voided = 0;
  let verified = 0;
  const outcomes = [];
  /** Places in `outcomes` of goals in shots something else touched (a hero, the owl): the server cannot play them, so it believes the app within a limit. */
  const trusted = [];
  const gaps = [];
  for (let index = 0; index < input.shots.length; index++) {
    const shot = input.shots[index];
    if (!shot || typeof shot !== "object" || Array.isArray(shot)) return bad("Invalid replay shot.");
    // the court is never taken from the player: a shot that brings any of it is refused
    for (const key of Object.keys(shot)) if (!SHOT_FIELDS.includes(key)) return bad("Replay shots must not carry court data.");
    if (shot.id !== index) return bad("Replay shots are out of order.");
    if (!finite(shot.t) || shot.t < 0 || shot.t <= previousTime) return bad("Replay times are out of order.");
    // shots cannot be closer than a throw takes; a long pause between two shots is fine (a player goes away and comes back)
    if (previousTime >= 0 && shot.t - previousTime < MIN_SHOT_GAP_MS) return bad("Replay shot timing is impossible.");
    if (previousTime >= 0) gaps.push(shot.t - previousTime);
    previousTime = shot.t;
    if (typeof shot.void !== "boolean" || typeof shot.goal !== "boolean") return bad("Replay result is invalid.");
    if (shot.void) {
      voided++;
      // The server cannot play a shot something else than physics touched. It still has to be a shot a hand could make from the floor;
      // a goal in it is believed within a limit that the caller sets (a share of the player's verified goals), so what the app counts and the board shows is the same.
      if (finite(shot.resultT) && shot.resultT > shot.t && shot.resultT - shot.t <= MAX_FLIGHT_MS && !shotProblem(shot)) {
        if (shot.goal) {
          claimedGoals++;
          trusted.push(outcomes.length);
        }
        outcomes.push(shot.goal);
      }
      continue;
    }
    verified++;
    if (!finite(shot.resultT)) return bad("Replay numbers are invalid.");
    const problem = shotProblem(shot);
    if (problem) return bad(`Replay: ${problem}`);
    const flight = shot.resultT - shot.t;
    if (flight <= 0 || flight > MAX_FLIGHT_MS) return bad("Replay shot time is impossible.");
    if (shot.goal) claimedGoals++;

    // what the player claims is checked against the replay; a miss is never turned into a goal
    let goal = false;
    if (shot.goal) {
      const { hoop } = soloCourt(seed, index, shot);
      const slack = Math.max(TIME_SLACK_MS, flight * TIME_SLACK_FRACTION);
      const maxTicks = Math.ceil((flight + slack) / TICK_MS) + 2;
      const played = simulateShot(shot, hoop, { maxTicks });
      goal = played.outcome === "goal" && Math.abs(played.tick * TICK_MS - flight) <= slack;
      if (!goal) unconfirmed++;
    }
    outcomes.push(goal);
  }
  const throws = outcomes.length;
  if (throws < 1) return bad("Replay has no counted shots.");
  const goals = outcomes.filter(Boolean).length;
  return { ok: true, throws, goals, outcomes, unconfirmed, claimedGoals, voided, verified, trusted, suspicion: suspicion(outcomes, gaps, unconfirmed, claimedGoals) };
}

/** Signs that a replay was made by a program: very few misses over many shots, shots at exactly the same pace, goals the replay cannot reproduce. */
function suspicion(outcomes, gaps, unconfirmed, claimedGoals) {
  const reasons = [];
  const n = outcomes.length;
  const goals = outcomes.filter(Boolean).length;
  if (n >= 30 && goals / n > 0.92) reasons.push("accuracy above 92 % over 30 or more shots");
  if (claimedGoals >= 10 && unconfirmed > Math.max(2, claimedGoals * 0.2)) reasons.push("many goals the replay does not reproduce");
  if (gaps.length >= 20) {
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const sd = Math.sqrt(gaps.reduce((a, b) => a + (b - mean) * (b - mean), 0) / gaps.length);
    if (sd < 40) reasons.push("shots at a perfectly even pace");
  }
  return reasons;
}
