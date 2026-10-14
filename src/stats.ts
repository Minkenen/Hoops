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
  heroes: number; // flying heroes shot down
  unlocked: Record<string, number>;
  /** Everything else that is counted: online results, play time, days in a row, one-off things. */
  extra: Record<string, number>;
  /** Things that were tried (courts, crowds), to count how many different ones. */
  sets: Record<string, string[]>;
}

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  /** The heading it is listed under in the Achievements window. */
  group: string;
  /** Current and target value, for the progress text. */
  progress: (s: Stats) => [number, number];
}

const KEY = "hoops.stats";

const DEFAULT: Stats = { throws: 0, goals: 0, streak: 0, bestStreak: 0, swishes: 0, banks: 0, rimGoals: 0, far: 0, heroes: 0, unlocked: {}, extra: {}, sets: {} };

const count = (pick: (s: Stats) => number, n: number) => (s: Stats): [number, number] => [Math.min(pick(s), n), n];
const ex = (key: string) => (s: Stats): number => s.extra[key] ?? 0;
const flag = (key: string) => (s: Stats): [number, number] => [Math.min(s.extra[key] ?? 0, 1), 1];
const acc = (min: number, shots: number) => (s: Stats): [number, number] => [s.throws >= shots && s.goals / s.throws >= min ? 1 : 0, 1];
const setSize = (key: string, n: number) => (s: Stats): [number, number] => [Math.min((s.sets[key] ?? []).length, n), n];
/** Number of distinct courts and crowd styles that can be tried. */
export const TRYABLE_COURTS = 9;
export const TRYABLE_CROWDS = 9;

const A = (group: string, id: string, name: string, desc: string, progress: Achievement["progress"]): Achievement => ({ id, name, desc, group, progress });

export const ACHIEVEMENTS: Achievement[] = [
  A("Shots", "first-throw", "First shot", "Take your first shot", count((s) => s.throws, 1)),
  A("Shots", "throws-10", "Warming up", "Take 10 shots", count((s) => s.throws, 10)),
  A("Shots", "throws-100", "Hundred shots", "Take 100 shots", count((s) => s.throws, 100)),
  A("Shots", "throws-1000", "Thousand shots", "Take 1,000 shots", count((s) => s.throws, 1000)),
  A("Shots", "throws-5000", "Five thousand shots", "Take 5,000 shots", count((s) => s.throws, 5000)),
  A("Goals", "first-goal", "First basket", "Score your first goal", count((s) => s.goals, 1)),
  A("Goals", "goals-10", "Ten baskets", "Score 10 goals", count((s) => s.goals, 10)),
  A("Goals", "goals-100", "Hundred baskets", "Score 100 goals", count((s) => s.goals, 100)),
  A("Goals", "goals-500", "Five hundred", "Score 500 goals", count((s) => s.goals, 500)),
  A("Goals", "goals-1000", "Thousand baskets", "Score 1,000 goals", count((s) => s.goals, 1000)),
  A("Goals", "goals-2500", "Two and a half thousand", "Score 2,500 goals", count((s) => s.goals, 2500)),
  A("Goals", "goals-5000", "Legend", "Score 5,000 goals", count((s) => s.goals, 5000)),
  A("Streaks", "streak-3", "Hat trick", "Score 3 in a row", count((s) => s.bestStreak, 3)),
  A("Streaks", "streak-5", "On fire", "Score 5 in a row", count((s) => s.bestStreak, 5)),
  A("Streaks", "streak-10", "Unstoppable", "Score 10 in a row", count((s) => s.bestStreak, 10)),
  A("Streaks", "streak-15", "Heating up", "Score 15 in a row", count((s) => s.bestStreak, 15)),
  A("Streaks", "streak-20", "Can't miss", "Score 20 in a row", count((s) => s.bestStreak, 20)),
  A("Style", "swish-1", "Nothing but net", "Score without touching the rim or board", count((s) => s.swishes, 1)),
  A("Style", "swish-10", "Clean shooter", "Score 10 clean swishes", count((s) => s.swishes, 10)),
  A("Style", "swish-50", "Smooth", "Score 50 clean swishes", count((s) => s.swishes, 50)),
  A("Style", "swish-200", "Pure", "Score 200 clean swishes", count((s) => s.swishes, 200)),
  A("Style", "swish-run-10", "Perfect round", "Score 10 clean swishes in a row", count(ex("swishBest"), 10)),
  A("Style", "bank-1", "Off the glass", "Score after hitting the backboard", count((s) => s.banks, 1)),
  A("Style", "bank-10", "Glass cleaner", "Score 10 times off the backboard", count((s) => s.banks, 10)),
  A("Style", "rim-1", "Lucky bounce", "Score after a bounce off the rim", count((s) => s.rimGoals, 1)),
  A("Style", "rim-10", "Rim rider", "Score 10 times after a rim bounce", count((s) => s.rimGoals, 10)),
  A("Style", "far-1", "Long range", "Score from the far side of the screen", count((s) => s.far, 1)),
  A("Style", "far-10", "Deep threat", "Score 10 times from the far side", count((s) => s.far, 10)),
  A("Accuracy", "sharp", "Sharpshooter", "Keep 50% accuracy over at least 50 shots", acc(0.5, 50)),
  A("Accuracy", "acc-60", "Dialed in", "Keep 60% accuracy over at least 100 shots", acc(0.6, 100)),
  A("Accuracy", "acc-70", "Marksman", "Keep 70% accuracy over at least 200 shots", acc(0.7, 200)),
  A("Online", "online-first", "Game on", "Play your first online match", count(ex("onlinePlayed"), 1)),
  A("Online", "online-win", "First win", "Win an online match", count(ex("onlineWins"), 1)),
  A("Online", "online-10", "Regular", "Play 10 online matches", count(ex("onlinePlayed"), 10)),
  A("Online", "online-50", "Veteran", "Play 50 online matches", count(ex("onlinePlayed"), 50)),
  A("Online", "win-10", "Winning streak", "Win 10 online matches", count(ex("onlineWins"), 10)),
  A("Online", "win-all", "All-rounder", "Win a Speedball, a HORSE and a 21 match", (s) => [(s.sets.winGames ?? []).length, 3]),
  A("Online", "horse-clean", "Clean sheet", "Win a HORSE match without getting a letter", flag("horseClean")),
  A("Online", "t21-big", "Blowout", "Win a 21 match by 10 points or more", flag("t21Big")),
  A("Online", "friend-room", "Friends only", "Play in a room you made or joined with a code", flag("friendRoom")),
  A("Explore", "hero-down", "Man down", "Shoot down the flying hero in the Park", count((s) => s.heroes, 1)),
  A("Explore", "hero-5", "Hero hunter", "Shoot down the flying hero 5 times", count((s) => s.heroes, 5)),
  A("Explore", "courts-all", "World tour", "Try every court", setSize("themes", TRYABLE_COURTS)),
  A("Explore", "crowds-all", "Crowd pleaser", "Try every crowd style", setSize("crowds", TRYABLE_CROWDS)),
  A("Explore", "skin-change", "New look", "Change the ball skin", flag("skinChanged")),
  A("Explore", "bought", "Supporter", "Unlock a paid theme or All Access", flag("bought")),
  A("Explore", "discord", "Join the crowd", "Open the Hooperly Discord", flag("discord")),
  A("Explore", "bug-report", "Bug catcher", "Report a bug", flag("bugReport")),
  A("Time", "days-3", "Back again", "Play 3 days in a row", count(ex("dayRunBest"), 3)),
  A("Time", "days-7", "Weekly habit", "Play 7 days in a row", count(ex("dayRunBest"), 7)),
  A("Time", "days-30", "Dedicated", "Play 30 days in a row", count(ex("dayRunBest"), 30)),
  A("Time", "play-1h", "An hour in", "Play for 1 hour in total", count((s) => Math.floor((s.extra.playSeconds ?? 0) / 60), 60)),
  A("Time", "play-10h", "Ten hours", "Play for 10 hours in total", count((s) => Math.floor((s.extra.playSeconds ?? 0) / 3600), 10)),
  A("Time", "night-owl", "Night owl", "Score a goal between midnight and 5 AM", flag("nightOwl")),
  A("Time", "early-bird", "Early bird", "Score a goal between 5 and 8 AM", flag("earlyBird")),
  A("Ranks", "on-board", "On the board", "Get a rank on the leaderboard", flag("onBoard")),
  A("Ranks", "rank-10", "Top ten", "Reach the top 10 on the leaderboard", flag("rank10")),
];

/** How many achievements are unlocked. */
export function achievementsDone(): number {
  const u = getStats().unlocked;
  return ACHIEVEMENTS.filter((a) => u[a.id]).length;
}

export function getStats(): Stats {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return { ...DEFAULT, ...p, unlocked: { ...(p.unlocked ?? {}) }, extra: { ...(p.extra ?? {}) }, sets: { ...(p.sets ?? {}) } };
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT, unlocked: {}, extra: {}, sets: {} };
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

/** Where achievements that are earned outside the game window (online results, settings, the menu) are announced. */
let listener: ((list: Achievement[]) => void) | null = null;
let waiting: Achievement[] = [];

export function setAchievementListener(f: (list: Achievement[]) => void): void {
  listener = f;
  if (waiting.length) {
    f(waiting);
    waiting = [];
  }
}

function tell(list: Achievement[]): Achievement[] {
  if (!list.length) return list;
  if (listener) listener(list);
  else waiting.push(...list);
  return list;
}

function finish(s: Stats): Achievement[] {
  const fresh = evaluate(s);
  save(s);
  return fresh;
}

const MAX_GAP_S = 90;

export function recordThrow(): Achievement[] {
  const s = getStats();
  s.throws++;
  // active play time: the time between shots, as long as the pause is short
  const now = Date.now();
  const last = s.extra.lastThrowAt ?? 0;
  if (last && now - last < MAX_GAP_S * 1000) s.extra.playSeconds = (s.extra.playSeconds ?? 0) + Math.round((now - last) / 1000);
  s.extra.lastThrowAt = now;
  return finish(s);
}

export function recordGoal(info: { clean: boolean; bank: boolean; rim: boolean; far: boolean }): Achievement[] {
  const s = getStats();
  s.goals++;
  s.streak++;
  s.bestStreak = Math.max(s.bestStreak, s.streak);
  if (info.clean) {
    s.swishes++;
    s.extra.swishRun = (s.extra.swishRun ?? 0) + 1;
    s.extra.swishBest = Math.max(s.extra.swishBest ?? 0, s.extra.swishRun);
  } else {
    s.extra.swishRun = 0;
  }
  if (info.bank) s.banks++;
  if (info.rim) s.rimGoals++;
  if (info.far) s.far++;
  const hour = new Date().getHours();
  if (hour < 5) s.extra.nightOwl = 1;
  else if (hour < 8) s.extra.earlyBird = 1;
  return finish(s);
}

export function recordHeroDown(): Achievement[] {
  const s = getStats();
  s.heroes++;
  return finish(s);
}

export function recordMiss(): void {
  const s = getStats();
  if (s.streak === 0 && !s.extra.swishRun) return;
  s.streak = 0;
  s.extra.swishRun = 0;
  save(s);
}

/** Adds to a counter (online matches played, and so on) and announces what it unlocks. */
export function bump(key: string, n = 1): Achievement[] {
  const s = getStats();
  s.extra[key] = (s.extra[key] ?? 0) + n;
  return tell(finish(s));
}

/** Marks a one-off thing as done. */
export function mark(key: string): Achievement[] {
  const s = getStats();
  if (s.extra[key]) return [];
  s.extra[key] = 1;
  return tell(finish(s));
}

/** Remembers that one more kind of thing was tried (a court, a crowd style). */
export function addToSet(key: string, value: string): Achievement[] {
  const s = getStats();
  const list = s.sets[key] ?? [];
  if (list.includes(value)) return [];
  s.sets[key] = [...list, value];
  return tell(finish(s));
}

/** Call when the game starts: counts days in a row. */
export function touchDay(): void {
  const s = getStats();
  const d = new Date();
  const day = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  const last = s.extra.lastDay ?? 0;
  if (last === day) return;
  const prev = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
  const yesterday = prev.getFullYear() * 10000 + (prev.getMonth() + 1) * 100 + prev.getDate();
  s.extra.dayRun = last === yesterday ? (s.extra.dayRun ?? 0) + 1 : 1;
  s.extra.dayRunBest = Math.max(s.extra.dayRunBest ?? 0, s.extra.dayRun);
  s.extra.lastDay = day;
  tell(finish(s));
}

export interface OnlineResult {
  game: "speed" | "horse" | "t21";
  won: boolean;
  /** HORSE letters you got. */
  letters: number;
  scoreMe: number;
  scoreOpp: number;
}

/** An online match is over. */
export function recordOnlineMatch(r: OnlineResult): Achievement[] {
  const s = getStats();
  s.extra.onlinePlayed = (s.extra.onlinePlayed ?? 0) + 1;
  if (r.won) {
    s.extra.onlineWins = (s.extra.onlineWins ?? 0) + 1;
    s.sets.winGames = [...new Set([...(s.sets.winGames ?? []), r.game])];
    if (r.game === "horse" && r.letters === 0) s.extra.horseClean = 1;
    if (r.game === "t21" && r.scoreMe - r.scoreOpp >= 10) s.extra.t21Big = 1;
  }
  return tell(finish(s));
}
