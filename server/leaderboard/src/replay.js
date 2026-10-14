const MAX_SHOTS = 200;
const MAX_REPLAY_BYTES = 64_000;
const MIN_SHOT_GAP_MS = 700;
const MAX_SHOT_GAP_MS = 120_000;
const MAX_SPEED = 2400;
import { collideCircle, collidePolygon, hoopCrossing, stepBall } from "../../../shared/physics.ts";
const BALL_RADIUS = 10.5;
function hash(value) { let h = 0; for (let i = 0; i < value.length; i++) h = Math.imul(31, h) + value.charCodeAt(i) | 0; return Math.abs(h); }

export function simulateReplayShot(shot) {
  const flight = shot.resultT - shot.t;
  if (!Number.isFinite(flight) || flight < 250 || flight > 30_000) return { crossed: false, flight };
  const state = { x: shot.x, y: shot.y, vx: shot.vx, vy: shot.vy, t: 0, gs: shot.gs, ang: 0 };
  let previousY = state.y;
  let bounces = 0;
  let elapsed = 0;
  while (elapsed < flight) {
    const dt = Math.min(1, flight - elapsed);
    elapsed += dt;
    const beforeY = state.y;
    const inNet = state.x > shot.hoopL && state.x < shot.hoopR && state.y > shot.hoopY && state.y < shot.hoopY + 36;
    stepBall(state, { dt, radius: BALL_RADIUS, gravityScale: inNet ? 1.12 : 1 });
    let { x, y, vx, vy } = state;
    if (x < 0 || x > shot.width) {
      x = Math.max(0, Math.min(shot.width, x));
      vx = -vx * 0.65;
      state.x = x; state.vx = vx;
      bounces++;
    }
    if ([shot.boardL, shot.boardR, shot.boardT, shot.boardB].every(Number.isFinite)) {
      const board = [[shot.boardL, shot.boardT], [shot.boardR, shot.boardT], [shot.boardR, shot.boardB], [shot.boardL, shot.boardB]];
      const hit = collidePolygon(state, board, 0, 0, BALL_RADIUS, 0.55);
      if (hit.hit) bounces++;
    }
    const rimFront = collideCircle(state, shot.hoopL, shot.hoopY, BALL_RADIUS + 1.8, 0.5);
    const rimBack = collideCircle(state, shot.hoopR, shot.hoopY, BALL_RADIUS + 1.8, 0.5);
    if (rimFront.hit || rimBack.hit) bounces++;
    if (y > shot.floorY - BALL_RADIUS) {
      y = shot.floorY - BALL_RADIUS;
      const restitution = bounces < 2 ? 0.74 : Math.max(0.35, 0.62 - (bounces - 2) * 0.1);
      bounces++;
      vy = -Math.abs(vy) * restitution;
      vx *= bounces > 2 ? 0.85 : 0.93;
      state.y = y; state.vy = vy; state.vx = vx;
    }
    if (bounces > 12) return { crossed: false, flight, bounces };
    const crossing = hoopCrossing(beforeY, state, shot.hoopY, shot.hoopL, shot.hoopR, BALL_RADIUS * 0.1);
    if (crossing.scored && !crossing.blocked) return { crossed: true, flight, bounces, x: state.x, y: state.y, vx: state.vx, vy: state.vy };
    previousY = y;
  }
  return { crossed: false, flight, bounces, x: state.x, y: state.y, vx: state.vx, vy: state.vy };
}

function expectedSide(seed, index) { return hash(`${seed}:${index}`) % 2 ? "right" : "left"; }
function expectedRimHeight(seed, index, height) {
  const max = Math.min(260, height * 0.6);
  return 70 + (hash(`${seed}:${index}`) % 100000) / 100000 * Math.max(10, max - 70);
}

export function verifyReplay(input) {
  if (!input || typeof input !== "object") return { ok: false, reason: "Invalid replay." };
  if (typeof input.sessionId !== "string" || !/^[a-zA-Z0-9_-]{8,80}$/.test(input.sessionId)) return { ok: false, reason: "Invalid replay session." };
  if (typeof input.seed !== "string" || input.seed.length < 8 || input.seed.length > 80) return { ok: false, reason: "Invalid replay seed." };
  if (!Array.isArray(input.shots) || input.shots.length < 1 || input.shots.length > MAX_SHOTS) return { ok: false, reason: "Invalid replay shots." };
  let previousTime = -1;
  let goals = 0;
  const ids = new Set();
  for (const shot of input.shots) {
    if (!shot || typeof shot !== "object") return { ok: false, reason: "Invalid replay shot." };
    if (!Number.isInteger(shot.id) || shot.id !== ids.size || ids.has(shot.id)) return { ok: false, reason: "Replay shots are out of order." };
    ids.add(shot.id);
    if (!Number.isFinite(shot.t) || shot.t < 0 || shot.t <= previousTime) return { ok: false, reason: "Replay times are out of order." };
    if (previousTime >= 0 && (shot.t - previousTime < MIN_SHOT_GAP_MS || shot.t - previousTime > MAX_SHOT_GAP_MS)) return { ok: false, reason: "Replay shot timing is impossible." };
    previousTime = shot.t;
    for (const key of ["x", "y", "vx", "vy"]) if (!Number.isFinite(shot[key]) || Math.abs(shot[key]) > MAX_SPEED * 2) return { ok: false, reason: "Replay physics are impossible." };
    const speed = Math.hypot(shot.vx, shot.vy);
    if (speed > MAX_SPEED) return { ok: false, reason: "Replay shot speed is impossible." };
    if (!Number.isFinite(shot.nx) || !Number.isFinite(shot.ny) || shot.nx < 0 || shot.nx > 1 || shot.ny < 0 || shot.ny > 1) return { ok: false, reason: "Replay coordinates are invalid." };
    if (!Number.isFinite(shot.width) || !Number.isFinite(shot.height) || shot.width < 100 || shot.height < 100 || shot.width > 2_000 || shot.height > 2_000) return { ok: false, reason: "Replay dimensions are invalid." };
    if (shot.x < 0 || shot.x > shot.width || shot.y < 0 || shot.y > shot.floorY || Math.abs(shot.nx - shot.x / shot.width) > 0.002 || Math.abs(shot.ny - shot.y / shot.height) > 0.002) return { ok: false, reason: "Replay coordinates do not match the shot." };
    if (!Number.isFinite(shot.floorY) || shot.floorY <= shot.hoopY || shot.floorY > shot.height + 40) return { ok: false, reason: "Replay floor data is invalid." };
    if (![shot.resultT, shot.gs, shot.hoopX, shot.hoopY, shot.hoopL, shot.hoopR].every(Number.isFinite) || shot.resultT <= shot.t || shot.resultT - shot.t > 30_000 || shot.gs < 0.25 || shot.gs > 2.5 || shot.hoopL >= shot.hoopR || shot.hoopX < shot.hoopL || shot.hoopX > shot.hoopR) return { ok: false, reason: "Replay hoop data is invalid." };
    const hoopWidth = (shot.hoopR - shot.hoopL) / shot.width;
    const hoopY = shot.hoopY / shot.height;
    const hoopCenter = shot.hoopX / shot.width;
    if (hoopWidth < 0.045 || hoopWidth > 0.16 || hoopCenter < 0.08 || hoopCenter > 0.92 || hoopY < 0.05 || hoopY > 0.9) return { ok: false, reason: "Replay hoop geometry is implausible." };
    if (shot.goal && !simulateReplayShot(shot).crossed) return { ok: false, reason: "Replay goal is not physically possible." };
    const center = shot.hoopX / shot.width;
    const side = center < 0.5 ? "left" : "right";
    if (side !== expectedSide(input.seed, shot.id)) return { ok: false, reason: "Replay hoop side does not match the session." };
    const expectedY = shot.floorY - expectedRimHeight(input.seed, shot.id, shot.height);
    if (Math.abs(shot.hoopY - expectedY) > 4) return { ok: false, reason: "Replay hoop height does not match the session." };
    if (typeof shot.goal !== "boolean") return { ok: false, reason: "Replay result is invalid." };
    if (shot.goal) goals++;
  }
  if (Number.isInteger(input.goals) && input.goals !== goals) return { ok: false, reason: "Replay score does not match its shots." };
  return { ok: true, shots: input.shots.length, goals };
}

export { MAX_REPLAY_BYTES };
