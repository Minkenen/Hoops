export const MIN_CLIENT_VERSION = "0.1.24";
export function versionAtLeast(version, minimum = MIN_CLIENT_VERSION) {
  const parse = (value) => String(value).split(".").map((part) => Number(part)).length === 3 && String(value).split(".").every((part) => /^\d+$/.test(part)) ? String(value).split(".").map(Number) : null;
  const a = parse(version); const b = parse(minimum);
  if (!a || !b) return false;
  return a[0] !== b[0] ? a[0] > b[0] : a[1] !== b[1] ? a[1] > b[1] : a[2] >= b[2];
}
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
  return `HooperlyFan${digits}`;
}

function hashCode(value) {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = Math.imul(31, h) + value.charCodeAt(i) | 0;
  return h;
}
