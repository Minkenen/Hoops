import { settings } from "./settings";

export type Sfx =
  | "shoot"
  | "stretch"
  | "bounce"
  | "wall"
  | "board"
  | "rim"
  | "swish"
  | "confetti"
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

export function play(name: Sfx, intensity = 1): void {
  if (!settings.sound || !urls.has(name)) return;
  const now = performance.now();
  if (now - (lastPlayed.get(name) ?? 0) < 45) return;
  lastPlayed.set(name, now);
  void load(name).then((buf) => {
    const c = audioCtx();
    if (!buf || !c) return;
    const src = c.createBufferSource();
    const gain = c.createGain();
    gain.gain.value = Math.max(0, Math.min(1, settings.volume * intensity));
    src.buffer = buf;
    src.connect(gain).connect(c.destination);
    src.start();
  });
}
