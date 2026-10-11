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
  | "ignite"
  | "extinguish"
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
  // WebKit also reports "interrupted" (sleep, a changed output device, another app taking the audio).
  if (ctx.state !== "running") void ctx.resume().catch(() => {});
  return ctx;
}

/** Throws the audio context away and makes a new one: the decoded buffers can be reused, only the context was stuck. */
function rebuildCtx(): AudioContext | null {
  try {
    void ctx?.close().catch(() => {});
  } catch {
    /* ignore */
  }
  ctx = null;
  probe = null;
  return audioCtx();
}

/** The context clock last time we played something; if it has not moved though time has, the context is stuck. */
let probe: { t: number; at: number } | null = null;
function stalled(c: AudioContext): boolean {
  const now = performance.now();
  const dead = !!probe && now - probe.at > 600 && c.currentTime === probe.t && c.state === "running";
  if (!probe || now - probe.at > 600) probe = { t: c.currentTime, at: now };
  return dead || c.state === "closed";
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
      // Do not remember the failure, so the sound gets another try next time.
      loading.delete(name);
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
  ignite: "sfxGoal",
  extinguish: "sfxGoal",
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
    let c = audioCtx();
    if (!buf || !c) return;
    if (stalled(c)) c = rebuildCtx();
    if (!c) return;
    const vol = Math.max(0, Math.min(1, settings.volume * intensity));
    const start = (cx: AudioContext): void => {
      const src = cx.createBufferSource();
      const gain = cx.createGain();
      gain.gain.value = vol;
      src.buffer = buf;
      src.playbackRate.value = rate;
      src.connect(gain).connect(cx.destination);
      src.start();
    };
    if (c.state === "running") {
      start(c);
      return;
    }
    // Not running (suspended or interrupted): wait briefly for it to resume, otherwise start over with a new context.
    const cx = c;
    let done = false;
    const go = (target: AudioContext | null): void => {
      if (!done && target) {
        done = true;
        start(target);
      }
    };
    void cx.resume().then(() => go(cx)).catch(() => go(rebuildCtx()));
    setTimeout(() => {
      if (!done && cx.state !== "running") go(rebuildCtx());
    }, 350);
  });
}

/** Decode every sound once up front, so the first goal does not stall while the browser decodes them. */
export function preloadSounds(): void {
  for (const name of urls.keys()) void load(name);
}

// Wake the audio up again when the window comes back (it may have been hidden, or the computer may have slept).
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && ctx && ctx.state !== "running") void ctx.resume().catch(() => {});
});
window.addEventListener("focus", () => {
  if (ctx && ctx.state !== "running") void ctx.resume().catch(() => {});
});

// After sleep the webview may refuse to restart the audio unless it happens inside a real click or key press,
// so every one of those gives a stopped context a nudge. (Fresh contexts also start out suspended until then.)
for (const ev of ["pointerdown", "pointerup", "keydown"]) {
  window.addEventListener(ev, () => {
    if (ctx && ctx.state === "closed") ctx = null;
    if (!ctx || ctx.state !== "running") audioCtx();
  }, { capture: true, passive: true });
}
