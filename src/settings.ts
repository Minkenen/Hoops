import type { BallSkinId, CourtSkinId, CrowdStyle } from "./skins";
import type { ThemeId } from "./themes";

export interface Settings {
  arrow: "arrow" | "dots";
  fireStyle: "pop" | "shatter";
  theme: ThemeId;
  confetti: number;
  bubble: number;
  sound: boolean;
  volume: number;
  ballScale: number;
  /** How see-through the ball is while it rests: 0 = solid. */
  ballFade: number;
  autostart: boolean;
  fullscreen: boolean;
  baseSkin: "plate" | "round" | "concrete";
  court: boolean;
  ballSkin: BallSkinId;
  courtSkin: CourtSkinId;
  crowd: CrowdStyle;
  arenaFill: boolean;
  stayOpen: boolean;
  sfxBounce: boolean;
  sfxShoot: boolean;
  sfxGoal: boolean;
  sfxMilestone: boolean;
  sfxAchievement: boolean;
  sfxUi: boolean;
}

const DEFAULTS: Settings = {
  arrow: "arrow",
  fireStyle: "pop",
  theme: "gym",
  confetti: 140,
  bubble: 2.5,
  sound: true,
  volume: 0.6,
  ballScale: 3,
  ballFade: 0.5,
  autostart: false,
  fullscreen: true,
  baseSkin: "plate",
  court: true,
  ballSkin: "classic",
  courtSkin: "parquet",
  crowd: "stands",
  arenaFill: false,
  stayOpen: false,
  sfxBounce: true,
  sfxShoot: true,
  sfxGoal: true,
  sfxMilestone: true,
  sfxAchievement: true,
  sfxUi: true,
};

const KEY = "hoops.settings";
const SCORE_KEY = "hoops.score";
const ONB_KEY = "hoops.onboarded";

type Listener = (k: keyof Settings) => void;
const listeners = new Set<Listener>();

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULTS };
}

export const settings: Settings = load();

export function reloadSettings(): void {
  Object.assign(settings, load());
}

export function setSetting<K extends keyof Settings>(k: K, v: Settings[K]): void {
  settings[k] = v;
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
  listeners.forEach((f) => f(k));
}

export function onSettingChange(f: Listener): void {
  listeners.add(f);
}

export function getScore(): number {
  return Number(localStorage.getItem(SCORE_KEY) ?? "0") || 0;
}

const BEST_KEY = "hoops.best";

/** The best score you have ever had: the score can be reset, this cannot. */
export function getBestScore(): number {
  return Math.max(Number(localStorage.getItem(BEST_KEY) ?? "0") || 0, getScore());
}

export function setScore(v: number): void {
  try {
    if (v > (Number(localStorage.getItem(BEST_KEY) ?? "0") || 0)) localStorage.setItem(BEST_KEY, String(v));
    localStorage.setItem(SCORE_KEY, String(v));
  } catch {
    /* ignore */
  }
}

const SHOTS_KEY = "hoops.shots";
const LAST10_KEY = "hoops.last10";

/** Shots taken since the score was last reset, for the screen on the LED wall. */
export function getShots(): number {
  return Number(localStorage.getItem(SHOTS_KEY) ?? "0") || 0;
}

export function getLast10(): number[] {
  try {
    const v = JSON.parse(localStorage.getItem(LAST10_KEY) ?? "[]");
    return Array.isArray(v) ? v.slice(-10) : [];
  } catch {
    return [];
  }
}

export function addShot(): void {
  try {
    localStorage.setItem(SHOTS_KEY, String(getShots() + 1));
  } catch {
    /* ignore */
  }
}

export function pushLast10(made: boolean): void {
  try {
    localStorage.setItem(LAST10_KEY, JSON.stringify([...getLast10(), made ? 1 : 0].slice(-10)));
  } catch {
    /* ignore */
  }
}

export function resetMatch(): void {
  try {
    localStorage.removeItem(SHOTS_KEY);
    localStorage.removeItem(LAST10_KEY);
  } catch {
    /* ignore */
  }
}

export function isOnboarded(): boolean {
  return localStorage.getItem(ONB_KEY) === "1";
}

export function setOnboarded(): void {
  try {
    localStorage.setItem(ONB_KEY, "1");
  } catch {
    /* ignore */
  }
}

const PREMIUM_KEY = "hoops.premium";

/** Whether the one-time Hoops All Access purchase is unlocked on this computer. */
export function isPremiumUnlocked(): boolean {
  try {
    return localStorage.getItem(PREMIUM_KEY) === "1";
  } catch {
    return false;
  }
}

export function setPremiumUnlocked(v: boolean): void {
  try {
    if (v) localStorage.setItem(PREMIUM_KEY, "1");
    else localStorage.removeItem(PREMIUM_KEY);
  } catch {
    /* ignore */
  }
}

const LICENSES_KEY = "hoops.licenses";

/** A license key that was activated on this computer: All Access ("all") or one theme ("theme"). */
export interface StoredLicense {
  key: string;
  unlock: "all" | "theme";
  theme: string;
}

export function getLicenses(): StoredLicense[] {
  try {
    const v = JSON.parse(localStorage.getItem(LICENSES_KEY) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function saveLicenses(list: StoredLicense[]): void {
  try {
    localStorage.setItem(LICENSES_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

export function addLicense(l: StoredLicense): void {
  saveLicenses([...getLicenses().filter((x) => x.key !== l.key), l]);
}

export function removeLicense(key: string): void {
  saveLicenses(getLicenses().filter((x) => x.key !== key));
}

export function clearLicenses(): void {
  try {
    localStorage.removeItem(LICENSES_KEY);
  } catch {
    /* ignore */
  }
}
