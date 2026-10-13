const MAX_SHOTS = 200;
const MAX_REPLAY_BYTES = 64_000;
const MIN_SHOT_GAP_MS = 700;
const MAX_SHOT_GAP_MS = 120_000;
const MAX_SPEED = 2400;
const G = 0.16;
function hash(value) { let h = 0; for (let i = 0; i < value.length; i++) h = Math.imul(31, h) + value.charCodeAt(i) | 0; return Math.abs(h); }

function predictedCrossing(shot) {
  const flight = shot.resultT - shot.t;
  if (!Number.isFinite(flight) || flight < 250 || flight > 30_000) return false;
  let x = shot.x;
  let y = shot.y;
  let vx = shot.vx;
  let vy = shot.vy;
  let previousY = y;
  let elapsed = 0;
  while (elapsed < flight) {
    const dt = Math.min(1, flight - elapsed);
    elapsed += dt;
    vy += G * (shot.gs + (1 - shot.gs) * Math.max(0, Math.min(1, elapsed / 40))) * dt;
    x += vx * dt;
    y += vy * dt;
    if (previousY < shot.hoopY && y >= shot.hoopY && vy > 0 && x > shot.hoopL && x < shot.hoopR) return true;
    previousY = y;
  }
  return false;
}

function expectedSide(seed, index) { return hash(`${seed}:${index}`) % 2 ? "right" : "left"; }

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
    if (!Number.isFinite(shot.width) || !Number.isFinite(shot.height) || shot.width < 100 || shot.height < 100 || shot.width > 10_000 || shot.height > 10_000) return { ok: false, reason: "Replay dimensions are invalid." };
    if (![shot.resultT, shot.gs, shot.hoopX, shot.hoopY, shot.hoopL, shot.hoopR].every(Number.isFinite) || shot.resultT <= shot.t || shot.hoopL >= shot.hoopR || shot.hoopX < shot.hoopL || shot.hoopX > shot.hoopR) return { ok: false, reason: "Replay hoop data is invalid." };
    const hoopWidth = (shot.hoopR - shot.hoopL) / shot.width;
    const hoopY = shot.hoopY / shot.height;
    if (hoopWidth < 0.04 || hoopWidth > 0.25 || hoopY < 0.05 || hoopY > 0.9) return { ok: false, reason: "Replay hoop geometry is implausible." };
    if (shot.goal && !predictedCrossing(shot)) return { ok: false, reason: "Replay goal is not physically possible." };
    const center = shot.hoopX / shot.width;
    const side = center < 0.5 ? "left" : "right";
    if (side !== expectedSide(input.seed, shot.id)) return { ok: false, reason: "Replay hoop side does not match the session." };
    if (typeof shot.goal !== "boolean") return { ok: false, reason: "Replay result is invalid." };
    if (shot.goal) goals++;
  }
  if (Number.isInteger(input.goals) && input.goals !== goals) return { ok: false, reason: "Replay score does not match its shots." };
  return { ok: true, shots: input.shots.length, goals };
}

export { MAX_REPLAY_BYTES };
