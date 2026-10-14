const MAX_SHOTS = 200;
const MAX_REPLAY_BYTES = 64_000;
const MIN_SHOT_GAP_MS = 700;
const MAX_SHOT_GAP_MS = 120_000;
const MAX_SPEED = 2400;
import { collideCircle, collidePolygon, hoopCrossing, netBallForce, stepBall } from "../../../shared/physics.ts";
const BALL_RADIUS = 10.5;
const NET_MASS = 30;
const NET_MAX_ACCEL = 0.35;
const CLIENT_GEOMETRY_FIELDS = ["floorY", "hoopX", "hoopY", "hoopL", "hoopR", "boardL", "boardR", "boardT", "boardB"];

export function hasClientGeometry(shot) {
  return CLIENT_GEOMETRY_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(shot, field));
}

export function applyReplayNetForce(state, shot, dt) {
  if (!(state.x > shot.hoopL && state.x < shot.hoopR && state.y > shot.hoopY && state.y < shot.hoopY + 36)) return false;
  let ax = 0;
  let ay = 0;
  for (const fraction of [0.15, 0.35, 0.5, 0.65, 0.85]) {
    const force = netBallForce({ x: shot.hoopL, y: shot.hoopY + 18, vx: 0, vy: 0, offsetX: (shot.hoopR - shot.hoopL) * fraction, offsetY: 0 }, state);
    ax += force.ballX / NET_MASS;
    ay += force.ballY / NET_MASS;
  }
  const acceleration = Math.hypot(ax, ay);
  if (acceleration > NET_MAX_ACCEL) {
    ax *= NET_MAX_ACCEL / acceleration;
    ay *= NET_MAX_ACCEL / acceleration;
  }
  state.vx += ax * dt;
  state.vy += ay * dt;
  return acceleration > 0;
}
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
    if (inNet) applyReplayNetForce(state, shot, dt);
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

export function replayGeometry(seed, index, width, height) {
  const side = expectedSide(seed, index);
  const center = side === "right" ? width * 0.82 : width * 0.18;
  const rimWidth = Math.max(20, width * 0.05);
  const floorY = height - Math.max(18, height * 0.08);
  const hoopY = floorY - expectedRimHeight(seed, index, height);
  const boardWidth = Math.max(34, width * 0.08);
  const boardHeight = Math.max(70, height * 0.24);
  const boardCenter = side === "right" ? center + rimWidth * 0.9 : center - rimWidth * 0.9;
  return { hoopX: center, hoopY, hoopL: center - rimWidth / 2, hoopR: center + rimWidth / 2, floorY, boardL: boardCenter - boardWidth / 2, boardR: boardCenter + boardWidth / 2, boardT: hoopY - boardHeight / 2, boardB: hoopY + boardHeight / 2 };
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
    if (!Number.isFinite(shot.width) || !Number.isFinite(shot.height) || shot.width < 100 || shot.height < 100 || shot.width > 2_000 || shot.height > 2_000) return { ok: false, reason: "Replay dimensions are invalid." };
    const geometry = replayGeometry(input.seed, shot.id, shot.width, shot.height);
    const hasClientGeometry = [shot.floorY, shot.hoopX, shot.hoopY, shot.hoopL, shot.hoopR].every(Number.isFinite);
    const physicsShot = hasClientGeometry ? { ...geometry, ...shot } : { ...shot, ...geometry };
    for (const key of ["x", "y", "vx", "vy"]) if (!Number.isFinite(shot[key]) || Math.abs(shot[key]) > MAX_SPEED * 2) return { ok: false, reason: "Replay physics are impossible." };
    const speed = Math.hypot(shot.vx, shot.vy);
    if (speed > MAX_SPEED) return { ok: false, reason: "Replay shot speed is impossible." };
    if (!Number.isFinite(shot.nx) || !Number.isFinite(shot.ny) || shot.nx < 0 || shot.nx > 1 || shot.ny < 0 || shot.ny > 1) return { ok: false, reason: "Replay coordinates are invalid." };
    if (shot.x < 0 || shot.x > shot.width || shot.y < 0 || shot.y > physicsShot.floorY || Math.abs(shot.nx - shot.x / shot.width) > 0.002 || Math.abs(shot.ny - shot.y / shot.height) > 0.002) return { ok: false, reason: "Replay coordinates do not match the shot." };
    if (physicsShot.floorY <= physicsShot.hoopY || physicsShot.floorY > shot.height + 40) return { ok: false, reason: "Replay floor data is invalid." };
    if (![shot.resultT, shot.gs, physicsShot.hoopX, physicsShot.hoopY, physicsShot.hoopL, physicsShot.hoopR].every(Number.isFinite) || shot.resultT <= shot.t || shot.resultT - shot.t > 30_000 || shot.gs < 0.25 || shot.gs > 2.5 || physicsShot.hoopL >= physicsShot.hoopR || physicsShot.hoopX < physicsShot.hoopL || physicsShot.hoopX > physicsShot.hoopR) return { ok: false, reason: "Replay hoop data is invalid." };
    const hoopWidth = (physicsShot.hoopR - physicsShot.hoopL) / shot.width;
    const hoopY = physicsShot.hoopY / shot.height;
    const hoopCenter = physicsShot.hoopX / shot.width;
    if (hoopWidth < 0.045 || hoopWidth > 0.16 || hoopCenter < 0.08 || hoopCenter > 0.92 || hoopY < 0.05 || hoopY > 0.9) return { ok: false, reason: "Replay hoop geometry is implausible." };
    if (shot.goal && !simulateReplayShot(physicsShot).crossed) return { ok: false, reason: "Replay goal is not physically possible." };
    const center = physicsShot.hoopX / shot.width;
    const side = center < 0.5 ? "left" : "right";
    if (side !== expectedSide(input.seed, shot.id)) return { ok: false, reason: "Replay hoop side does not match the session." };
    const expectedY = physicsShot.floorY - expectedRimHeight(input.seed, shot.id, shot.height);
    if (Math.abs(physicsShot.hoopY - expectedY) > 4) return { ok: false, reason: "Replay hoop height does not match the session." };
    if (typeof shot.goal !== "boolean") return { ok: false, reason: "Replay result is invalid." };
    if (shot.goal) goals++;
  }
  if (Number.isInteger(input.goals) && input.goals !== goals) return { ok: false, reason: "Replay score does not match its shots." };
  return { ok: true, shots: input.shots.length, goals };
}

export { MAX_REPLAY_BYTES };
