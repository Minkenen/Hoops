// Lifetime statistics and achievements, kept in localStorage. The score can be reset; these are never reset by it.

export interface Stats {
  throws: number;
  goals: number;
  streak: number;
  bestStreak: number;
  swishes: number; // goals that touched nothing
  banks: number; // goals after hitting the board
  rimGoals: number; // goals after a rim bounce
  far: number; // goals from the far side of the screen
  unlocked: Record<string, number>;
}

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  /** Current and target value, for the progress text. */
  progress: (s: Stats) => [number, number];
}

const KEY = "hoops.stats";

const DEFAULT: Stats = { throws: 0, goals: 0, streak: 0, bestStreak: 0, swishes: 0, banks: 0, rimGoals: 0, far: 0, unlocked: {} };

const count = (pick: (s: Stats) => number, n: number) => (s: Stats): [number, number] => [Math.min(pick(s), n), n];

export const ACHIEVEMENTS: Achievement[] = [
  { id: "first-throw", name: "First shot", desc: "Take your first shot", progress: count((s) => s.throws, 1) },
  { id: "throws-10", name: "Warming up", desc: "Take 10 shots", progress: count((s) => s.throws, 10) },
  { id: "throws-100", name: "Hundred shots", desc: "Take 100 shots", progress: count((s) => s.throws, 100) },
  { id: "throws-1000", name: "Thousand shots", desc: "Take 1,000 shots", progress: count((s) => s.throws, 1000) },
  { id: "first-goal", name: "First basket", desc: "Score your first goal", progress: count((s) => s.goals, 1) },
  { id: "goals-10", name: "Ten baskets", desc: "Score 10 goals", progress: count((s) => s.goals, 10) },
  { id: "goals-100", name: "Hundred baskets", desc: "Score 100 goals", progress: count((s) => s.goals, 100) },
  { id: "goals-500", name: "Five hundred", desc: "Score 500 goals", progress: count((s) => s.goals, 500) },
  { id: "streak-3", name: "Hat trick", desc: "Score 3 in a row", progress: count((s) => s.bestStreak, 3) },
  { id: "streak-5", name: "On fire", desc: "Score 5 in a row", progress: count((s) => s.bestStreak, 5) },
  { id: "streak-10", name: "Unstoppable", desc: "Score 10 in a row", progress: count((s) => s.bestStreak, 10) },
  { id: "swish-1", name: "Nothing but net", desc: "Score without touching the rim or board", progress: count((s) => s.swishes, 1) },
  { id: "swish-10", name: "Clean shooter", desc: "Score 10 clean swishes", progress: count((s) => s.swishes, 10) },
  { id: "bank-1", name: "Off the glass", desc: "Score after hitting the backboard", progress: count((s) => s.banks, 1) },
  { id: "rim-1", name: "Lucky bounce", desc: "Score after a bounce off the rim", progress: count((s) => s.rimGoals, 1) },
  { id: "far-1", name: "Long range", desc: "Score from the far side of the screen", progress: count((s) => s.far, 1) },
  { id: "sharp", name: "Sharpshooter", desc: "Keep 50% accuracy over at least 50 shots", progress: (s) => [s.throws >= 50 && s.goals / s.throws >= 0.5 ? 1 : 0, 1] },
];

export function getStats(): Stats {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT, ...JSON.parse(raw), unlocked: { ...(JSON.parse(raw).unlocked ?? {}) } };
  } catch {
    /* ignore */
  }
  return { ...DEFAULT, unlocked: {} };
}

function save(s: Stats): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

/** Marks every achievement that is now reached as unlocked, and returns the new ones. */
function evaluate(s: Stats): Achievement[] {
  const fresh: Achievement[] = [];
  for (const a of ACHIEVEMENTS) {
    if (s.unlocked[a.id]) continue;
    const [cur, max] = a.progress(s);
    if (cur >= max) {
      s.unlocked[a.id] = Date.now();
      fresh.push(a);
    }
  }
  return fresh;
}

export function recordThrow(): Achievement[] {
  const s = getStats();
  s.throws++;
  const fresh = evaluate(s);
  save(s);
  return fresh;
}

export function recordGoal(info: { clean: boolean; bank: boolean; rim: boolean; far: boolean }): Achievement[] {
  const s = getStats();
  s.goals++;
  s.streak++;
  s.bestStreak = Math.max(s.bestStreak, s.streak);
  if (info.clean) s.swishes++;
  if (info.bank) s.banks++;
  if (info.rim) s.rimGoals++;
  if (info.far) s.far++;
  const fresh = evaluate(s);
  save(s);
  return fresh;
}

export function recordMiss(): void {
  const s = getStats();
  if (s.streak === 0) return;
  s.streak = 0;
  save(s);
}
