const MAX_SHOTS = 200;
const MAX_REPLAY_BYTES = 64_000;
const MIN_SHOT_GAP_MS = 700;
const MAX_SHOT_GAP_MS = 120_000;
const MAX_SPEED = 2400;

export function verifyReplay(input) {
  if (!input || typeof input !== "object") return { ok: false, reason: "Invalid replay." };
  if (typeof input.sessionId !== "string" || !/^[a-zA-Z0-9_-]{8,80}$/.test(input.sessionId)) return { ok: false, reason: "Invalid replay session." };
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
    if (typeof shot.goal !== "boolean") return { ok: false, reason: "Replay result is invalid." };
    if (shot.goal) goals++;
  }
  if (Number.isInteger(input.goals) && input.goals !== goals) return { ok: false, reason: "Replay score does not match its shots." };
  return { ok: true, shots: input.shots.length, goals };
}

export { MAX_REPLAY_BYTES };
