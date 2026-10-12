export const SCORE_SYNC_MS = 30_000;
export const MAX_SCORE = 100_000;
export const MAX_POINTS_PER_MINUTE = 180;
export const NICKNAME_INVALID_ERROR = "Use 3 to 18 letters, numbers, spaces, - or _.";
export const NICKNAME_TAKEN_ERROR = "That name is taken. Try another.";

export function weekKey(now = Date.now()) {
  const d = new Date(now);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - day + 1);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

export function cleanNickname(value) {
  const cleaned = String(value || "")
    .replace(/[^a-zA-Z0-9 _-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 18);
  const banned = /\b(fuck|shit|cunt|bitch|nazi|rape)\b/i;
  return cleaned.length >= 3 && !banned.test(cleaned) ? cleaned : null;
}

export function nicknameLower(nickname) {
  return cleanNickname(nickname)?.toLowerCase() || null;
}

export function nicknameDecision(value, existingLowerNames = new Set()) {
  const nickname = cleanNickname(value);
  const lower = nickname && nicknameLower(nickname);
  if (!nickname || !lower) return { ok: false, status: 400, error: NICKNAME_INVALID_ERROR };
  if (existingLowerNames.has(lower)) return { ok: false, status: 409, error: NICKNAME_TAKEN_ERROR };
  return { ok: true, nickname, lower };
}

export function defaultNickname(seed, attempt = 0) {
  const digits = String(Math.abs(hashCode(`${seed}:${attempt}`)) % 9000 + 1000);
  return `HoopsFan${digits}`;
}

export function scoreDecision(input, previous, now = Date.now()) {
  const score = Number(input?.score);
  const bestStreak = Number(input?.bestStreak);
  const throws = Number(input?.throws);
  const goals = Number(input?.goals);
  if (![score, bestStreak, throws, goals].every(Number.isInteger)) return { ok: false, reason: "Scores must be integers." };
  if (score < 0 || bestStreak < 0 || throws < 0 || goals < 0 || score > MAX_SCORE) return { ok: false, reason: "Score is out of range." };
  if (goals > throws || score > goals) return { ok: false, reason: "Score stats are inconsistent." };
  if (previous?.updated_at && now - previous.updated_at < SCORE_SYNC_MS) return { ok: false, reason: "Too many score submissions." };
  if (previous?.best_score != null && score > previous.best_score) {
    const elapsedMinutes = Math.max(1, (now - (previous.updated_at || now)) / 60_000);
    const allowedGain = Math.ceil(elapsedMinutes * MAX_POINTS_PER_MINUTE) + 5;
    if (score - previous.best_score > allowedGain) return { ok: false, reason: "Score increase is implausible." };
  }
  return { ok: true, score, bestStreak, throws, goals };
}

function hashCode(value) {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = Math.imul(31, h) + value.charCodeAt(i) | 0;
  return h;
}
