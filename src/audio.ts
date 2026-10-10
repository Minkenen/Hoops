import { settings } from "./settings";

export type Sfx =
  | "shoot"
  | "stretch"
  | "bounce"
  | "wall"
  | "board"
  | "rim"
  | "swish"
  | "swoosh2"
  | "confetti"
  | "cheer"
  | "boom"
  | "milestone"
  | "levelup"
  | "achievement"
  | "achievement2"
  | "gasp"
  | "crowd"
  | "appear"
  | "ui";

const files = import.meta.glob("./assets/sounds/*.{wav,mp3,ogg,m4a}", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

const urls = new Map<string, string>();
for (const [path, url] of Object.entries(files)) {
  const name = path.split("/").pop()!.replace(/\.[^.]+$/, "");
  urls.set(name, url);
}

let ctx: AudioContext | null = null;
const buffers = new Map<string, AudioBuffer | null>();
const loading = new Map<string, Promise<AudioBuffer | null>>();
const lastPlayed = new Map<string, number>();

function audioCtx(): AudioContext | null {
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

async function load(name: string): Promise<AudioBuffer | null> {
  if (buffers.has(name)) return buffers.get(name) ?? null;
  const pending = loading.get(name);
  if (pending) return pending;
  const url = urls.get(name);
  const c = audioCtx();
  if (!url || !c) {
    buffers.set(name, null);
    return null;
  }
  const p = fetch(url)
    .then((r) => r.arrayBuffer())
    .then((b) => c.decodeAudioData(b))
    .then((buf) => {
      buffers.set(name, buf);
      return buf;
    })
    .catch(() => {
      buffers.set(name, null);
      return null;
    });
  loading.set(name, p);
  return p;
}

const GROUP: Record<Sfx, "sfxBounce" | "sfxShoot" | "sfxGoal" | "sfxMilestone" | "sfxAchievement" | "sfxUi"> = {
  shoot: "sfxShoot",
  stretch: "sfxShoot",
  bounce: "sfxBounce",
  wall: "sfxBounce",
  board: "sfxBounce",
  rim: "sfxBounce",
  swish: "sfxGoal",
  swoosh2: "sfxGoal",
  confetti: "sfxGoal",
  cheer: "sfxGoal",
  boom: "sfxGoal",
  crowd: "sfxGoal",
  milestone: "sfxMilestone",
  levelup: "sfxMilestone",
  achievement: "sfxAchievement",
  achievement2: "sfxAchievement",
  gasp: "sfxGoal",
  appear: "sfxUi",
  ui: "sfxUi",
};

const ALIAS: Partial<Record<Sfx, Sfx>> = { wall: "bounce", board: "bounce", rim: "bounce" };
const VARY = new Set<Sfx>(["bounce", "wall", "board", "rim"]);
let lastRate = 1;

function pickRate(intensity: number): number {
  let r: number;
  do {
    r = 0.94 + Math.random() * 0.14;
  } while (Math.abs(r - lastRate) < 0.035);
  lastRate = r;
  return r * (1.03 - 0.06 * Math.max(0, Math.min(1, intensity)));
}

export function play(name: Sfx, intensity = 1): void {
  const file = urls.has(name) ? name : (ALIAS[name] ?? name);
  if (!settings.sound || !settings[GROUP[name]] || !urls.has(file)) return;
  const now = performance.now();
  if (now - (lastPlayed.get(name) ?? 0) < 45) return;
  lastPlayed.set(name, now);
  const rate = VARY.has(name) ? pickRate(intensity) : 1;
  void load(file).then((buf) => {
    const c = audioCtx();
    if (!buf || !c) return;
    const src = c.createBufferSource();
    const gain = c.createGain();
    gain.gain.value = Math.max(0, Math.min(1, settings.volume * intensity));
    src.buffer = buf;
    src.playbackRate.value = rate;
    src.connect(gain).connect(c.destination);
    src.start();
  });
}

/** Decode every sound once up front, so the first goal does not stall while the browser decodes them. */
export function preloadSounds(): void {
  for (const name of urls.keys()) void load(name);
}
