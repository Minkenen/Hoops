// Trails behind the ball, earned with achievements: a new one for every three.
// The game draws the trail while the ball flies; the Achievements window shows them as a road with small previews.
import { ACHIEVEMENTS, getStats } from "./stats";

export type TrailId = "none" | "dust" | "speed" | "spark" | "comet" | "rainbow" | "gold";

export interface Trail {
  id: TrailId;
  name: string;
  /** How many achievements it takes. */
  need: number;
  desc: string;
}

export const TRAILS: Trail[] = [
  { id: "none", name: "No trail", need: 0, desc: "Just the ball." },
  { id: "dust", name: "Dust", need: 3, desc: "Little puffs of dust behind the ball." },
  { id: "speed", name: "Speed lines", need: 6, desc: "White streaks, like a comic." },
  { id: "spark", name: "Sparkles", need: 9, desc: "Twinkling stars fall off the ball." },
  { id: "comet", name: "Comet", need: 12, desc: "A glowing tail from orange to blue." },
  { id: "rainbow", name: "Rainbow", need: 15, desc: "A pixel rainbow ribbon." },
  { id: "gold", name: "Gold stars", need: ACHIEVEMENTS.length, desc: "Golden stars and a glow. Every achievement." },
];

export const trailById = (id: string): Trail => TRAILS.find((t) => t.id === id) ?? TRAILS[0];

/** How many achievements you have. */
export function achievementsDone(): number {
  const u = getStats().unlocked;
  return ACHIEVEMENTS.filter((a) => u[a.id]).length;
}

export const trailOwned = (t: Trail, done = achievementsDone()): boolean => done >= t.need;

/** The trails that became yours when the count went from before to after. */
export const trailsUnlockedBetween = (before: number, after: number): Trail[] => TRAILS.filter((t) => t.need > before && t.need <= after);

export interface TrailPoint {
  x: number;
  y: number;
}

function r(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, col: string): void {
  c.fillStyle = col;
  c.fillRect(Math.round(x), Math.round(y), w, h);
}

/** Draws a trail along hist (oldest first, the ball is at the end). s is the pixel size, t the time in ms (for twinkles). */
export function drawTrail(c: CanvasRenderingContext2D, id: TrailId, hist: TrailPoint[], t: number, s = 1): void {
  const n = hist.length;
  if (id === "none" || n < 2) return;
  const a0 = c.globalAlpha;
  if (id === "dust") {
    for (let i = 0; i < n; i += 3) {
      const p = hist[i];
      const a = i / n;
      const rad = (1 + (1 - a) * 2) * s;
      c.globalAlpha = a0 * a * 0.6;
      r(c, p.x - rad, p.y - rad, rad * 2, rad * 2, "#c8c4b8");
    }
  } else if (id === "speed") {
    for (let i = 0; i < n - 1; i += 2) {
      const p = hist[i];
      c.globalAlpha = a0 * (i / n);
      r(c, p.x - s, p.y - 3 * s + (i % 4 ? 0 : 5 * s), 3 * s, s, "#ffffff");
    }
  } else if (id === "spark") {
    for (let i = 0; i < n; i += 2) {
      const p = hist[i];
      const a = i / n;
      const tw = (i + Math.floor(t / 80)) % 4 === 0;
      c.globalAlpha = a0 * a;
      const col = tw ? "#ffffff" : "#ffe14a";
      const ox = (((i * 37) % 7) - 3) * s;
      const oy = (((i * 53) % 7) - 3) * s + (1 - a) * 6 * s;
      r(c, p.x + ox, p.y + oy, s, s, col);
      if (tw) {
        r(c, p.x + ox - s, p.y + oy, 3 * s, s, col);
        r(c, p.x + ox, p.y + oy - s, s, 3 * s, col);
      }
    }
  } else if (id === "comet") {
    for (let i = 0; i < n; i++) {
      const p = hist[i];
      const a = i / n;
      const rad = Math.max(1, Math.round(a * 3.5 * s));
      const col = a > 0.7 ? "#fff2b0" : a > 0.45 ? "#ff9a2a" : a > 0.25 ? "#e8392b" : "#3a6fd9";
      c.globalAlpha = a0 * Math.min(1, a * 1.3);
      r(c, p.x - rad, p.y - rad, rad * 2, rad * 2, col);
    }
  } else if (id === "rainbow") {
    const cols = ["#e8392b", "#ff9a2a", "#ffe14a", "#3ab36a", "#3a8bd9", "#9a5ae0"];
    for (let i = 0; i < n; i++) {
      const p = hist[i];
      c.globalAlpha = a0 * Math.min(1, (i / n) * 1.5);
      cols.forEach((col, k) => r(c, p.x - s, p.y - 3 * s + k * s, 2 * s, s, col));
    }
  } else if (id === "gold") {
    for (let i = 0; i < n; i += 3) {
      const p = hist[i];
      c.globalAlpha = a0 * (i / n) * 0.5;
      r(c, p.x - 3 * s, p.y - 3 * s, 6 * s, 6 * s, "#ffd84a");
    }
    for (let i = 0; i < n; i += 4) {
      const p = hist[i];
      c.globalAlpha = a0 * (i / n);
      const ox = (((i * 29) % 9) - 4) * s;
      const oy = (((i * 41) % 9) - 4) * s;
      const col = (i + Math.floor(t / 90)) % 3 === 0 ? "#ffffff" : "#ffc83a";
      r(c, p.x + ox - s, p.y + oy, 3 * s, s, col);
      r(c, p.x + ox, p.y + oy - s, s, 3 * s, col);
    }
  }
  c.globalAlpha = a0;
}

const BALL = ["..1111..", ".122221.", "12233221", "12222221", "12222221", "12222221", ".122221.", "..1111.."];

/** A small animated preview: a ball flying back and forth with the trail. Stops by itself when the canvas leaves the page. */
export function trailPreview(cv: HTMLCanvasElement, id: TrailId, locked: boolean): void {
  const c = cv.getContext("2d");
  if (!c) return;
  c.imageSmoothingEnabled = false;
  const hist: TrailPoint[] = [];
  const W = cv.width;
  const H = cv.height;
  const start = performance.now();
  const frame = (now: number): void => {
    if (!cv.isConnected) return;
    const t = now - start;
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#1b1e33");
    g.addColorStop(1, "#2d3150");
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    r(c, 0, H - 5, W, 5, "#d9a15c");
    const T = 1800;
    const u = (t % T) / T;
    const back = Math.floor(t / T) % 2 === 1;
    const m = Math.max(6, W * 0.08);
    const x = back ? W - m - (W - 2 * m) * u : m + (W - 2 * m) * u;
    const y = H - 9 - Math.sin(u * Math.PI) * H * 0.6;
    if (hist.length && Math.abs(hist[hist.length - 1].x - x) > W / 2) hist.length = 0;
    hist.push({ x, y });
    if (hist.length > 30) hist.shift();
    c.globalAlpha = locked ? 0.35 : 1;
    drawTrail(c, id, hist, t, 1);
    const pal: Record<string, string> = { "1": "#0d0e12", "2": "#e8731f", "3": "#ff9a45" };
    BALL.forEach((row, j) => [...row].forEach((ch, i) => ch !== "." && r(c, x - 4 + i, y - 4 + j, 1, 1, pal[ch])));
    c.globalAlpha = 1;
    if (locked) {
      r(c, W / 2 - 4, H / 2 - 5, 8, 2, "#ffc83a");
      r(c, W / 2 - 4, H / 2 - 5, 2, 4, "#ffc83a");
      r(c, W / 2 + 2, H / 2 - 5, 2, 4, "#ffc83a");
      r(c, W / 2 - 5, H / 2 - 1, 10, 7, "#ffc83a");
      r(c, W / 2 - 1, H / 2 + 1, 2, 3, "#1c1c22");
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/** Starts every preview in a window: canvases marked data-trail="comet" (and data-locked="1" when not yours yet). */
export function startTrailPreviews(host: HTMLElement): void {
  host.querySelectorAll<HTMLCanvasElement>("canvas[data-trail]").forEach((cv) => trailPreview(cv, (cv.dataset.trail ?? "none") as TrailId, cv.dataset.locked === "1"));
}
