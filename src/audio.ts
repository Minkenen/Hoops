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
/**
 * After the computer sleeps or the screen locks, the audio output can be gone even though the context says it is running
 * (the clock keeps moving, but nothing is heard). A ticking timer notices the gap: when it did not run for a while,
 * the context is thrown away and a new one made the next time something should play.
 */
let lastTick = Date.now();
let stale = false;
window.setInterval(() => {
  const now = Date.now();
  if (now - lastTick > 4000) stale = true;
  lastTick = now;
}, 1000);

function stalled(c: AudioContext): boolean {
  if (stale) {
    stale = false;
    return true;
  }
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

/**
 * Each file is louder or quieter than the others as it came, so every sound gets a trim that evens them out
 * (measured with ffmpeg ebur128; the numbers are the loudness before the trim). Targets: footsteps of the game
 * (bounce, shoot, swish) around -20 LUFS, the layers of a goal a bit under that so together they are the loudest moment,
 * and the rare jingles (level up, milestone, achievements) clearly audible but not startling. Values above 1 are fine:
 * those files are quiet and have headroom.
 */
const TRIM: Partial<Record<Sfx, number>> = {
  bounce: 1, // -18.8
  shoot: 1, // -20.9
  swish: 1, // -20.2
  swoosh2: 0.5, // short burst with a 0 dB peak
  cheer: 0.32, // -9.0
  boom: 0.28, // -10.2, peaks at 0 dB
  crowd: 0.56, // -15.8
  gasp: 0.8, // -21.4
  ignite: 0.45, // -11.1
  extinguish: 0.24, // -7.6, peaks at 0 dB
  levelup: 0.29, // -7.3, peaks at 0 dB
  milestone: 1.8, // -25.2, peak -16.7 dB
  achievement: 2.7, // -28.6, peak -11.1 dB
  achievement2: 1.26, // -21.0, peak -5.3 dB
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
    const vol = Math.max(0, Math.min(1, settings.volume * intensity)) * (TRIM[file] ?? 1);
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
let hiddenAt = 0;
document.addEventListener("visibilitychange", () => {
  if (document.hidden) hiddenAt = Date.now();
  else if (hiddenAt && Date.now() - hiddenAt > 8000) stale = true;
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
