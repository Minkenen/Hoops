export interface Settings {
  arrow: "arrow" | "dots";
  confetti: number;
  bubble: number;
  sound: boolean;
  volume: number;
  ballScale: number;
  autostart: boolean;
  fullscreen: boolean;
}

const DEFAULTS: Settings = {
  arrow: "arrow",
  confetti: 140,
  bubble: 2.5,
  sound: true,
  volume: 0.7,
  ballScale: 3,
  autostart: false,
  fullscreen: true,
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

export function setScore(v: number): void {
  try {
    localStorage.setItem(SCORE_KEY, String(v));
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
