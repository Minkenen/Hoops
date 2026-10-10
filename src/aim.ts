import { DARK, HALO, clamp, mix } from "./draw";
import { BALL_R } from "./sprites";

export const G = 0.16;
export const VMAX = 9;
export const RANGE_FACTOR = 1.35;

export function maxSpeed(screenArtWidth: number): number {
  return Math.max(VMAX, Math.sqrt(RANGE_FACTOR * G * screenArtWidth));
}
export const MAXPULL = 40;
export const MAXLEN = 70;
export const TFADE = 40;

export const geff = (gs: number, tf: number): number => G * (gs + (1 - gs) * clamp(tf / TFADE, 0, 1));

type Pt = [number, number, number];

function predict(px: number, py: number, vx: number, vy: number, maxLen: number, gs: number): Pt[] {
  const pts: Pt[] = [[px, py, 0]];
  let x = px;
  let y = py;
  let s = 0;
  const dt = 0.25;
  for (let i = 0; i < 4000; i++) {
    vy += geff(gs, i * dt) * dt;
    const nx = x + vx * dt;
    const ny = y + vy * dt;
    s += Math.hypot(nx - x, ny - y);
    x = nx;
    y = ny;
    pts.push([x, y, s]);
    if (s >= maxLen) break;
  }
  return pts;
}

function at(pts: Pt[], s: number): [number, number, number, number] {
  s = clamp(s, 0, pts[pts.length - 1][2]);
  let i = 1;
  while (i < pts.length - 1 && pts[i][2] < s) i++;
  const a = pts[i - 1];
  const b = pts[i];
  const seg = b[2] - a[2] || 1;
  const f = (s - a[2]) / seg;
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, (b[0] - a[0]) / seg, (b[1] - a[1]) / seg];
}

const TPL = new Map<number, [number, number][]>();
function tpl(D: number): [number, number][] {
  let t = TPL.get(D);
  if (!t) {
    const c = (D - 1) / 2;
    t = [];
    for (let j = 0; j < D; j++) {
      for (let i = 0; i < D; i++) {
        if (Math.hypot(i - c, j - c) <= D / 2 - 0.1) t.push([i, j]);
      }
    }
    TPL.set(D, t);
  }
  return t;
}

interface Ops {
  disk(x: number, y: number, r: number, c: string): void;
  tri(a: [number, number], b: [number, number], c: [number, number], col: string): void;
  dot(x: number, y: number, D: number, c: string): void;
}

function passes(ctx: CanvasRenderingContext2D, build: (ops: Ops, m: number) => void): void {
  for (const m of [2, 1, 0]) {
    const pm = new Map<number, [number, number, string]>();
    const put = (x: number, y: number, c: string) => pm.set(y * 16384 + x, [x, y, c]);
    const disk = (x: number, y: number, r: number, c: string) => {
      r += m;
      const rr = r * r + 0.2;
      const X = Math.round(x);
      const Y = Math.round(y);
      const q = Math.ceil(r);
      for (let j = -q; j <= q; j++) for (let i = -q; i <= q; i++) if (i * i + j * j <= rr) put(X + i, Y + j, c);
    };
    const tri = (a: [number, number], b: [number, number], c: [number, number], col: string) => {
      const mnx = Math.floor(Math.min(a[0], b[0], c[0]));
      const mxx = Math.ceil(Math.max(a[0], b[0], c[0]));
      const mny = Math.floor(Math.min(a[1], b[1], c[1]));
      const mxy = Math.ceil(Math.max(a[1], b[1], c[1]));
      const sg = (p: [number, number], q: [number, number], r: [number, number]) =>
        (p[0] - r[0]) * (q[1] - r[1]) - (q[0] - r[0]) * (p[1] - r[1]);
      for (let y = mny; y <= mxy; y++) {
        for (let x = mnx; x <= mxx; x++) {
          const p: [number, number] = [x, y];
          const d1 = sg(p, a, b);
          const d2 = sg(p, b, c);
          const d3 = sg(p, c, a);
          const neg = d1 < 0 || d2 < 0 || d3 < 0;
          const pos = d1 > 0 || d2 > 0 || d3 > 0;
          if (!(neg && pos)) {
            if (m === 0) put(x, y, col);
            else disk(x, y, 0, col);
          }
        }
      }
    };
    const dot = (x: number, y: number, D: number, c: string) => {
      D += 2 * m;
      const X = Math.round(x - (D - 1) / 2);
      const Y = Math.round(y - (D - 1) / 2);
      for (const [i, j] of tpl(D)) put(X + i, Y + j, c);
    };
    build({ disk, tri, dot }, m);
    const pc = m === 2 ? HALO : m === 1 ? DARK : null;
    for (const [x, y, c] of pm.values()) {
      ctx.fillStyle = pc ?? c;
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

export const DOT_SIZE = 5;
export const DOT_SPACING = 10;

export function drawAim(
  ctx: CanvasRenderingContext2D,
  kind: "arrow" | "dots",
  x: number,
  y: number,
  dirX: number,
  dirY: number,
  power: number,
  gs: number,
  vmax: number,
): void {
  const vx = dirX * power * vmax;
  const vy = dirY * power * vmax;
  const tip = Math.pow(power, 1.3);
  if (kind === "arrow") {
    const s0 = BALL_R + 3;
    const pts = predict(x, y, vx, vy, s0 + 8 + MAXLEN + 6, gs);
    const total = pts[pts.length - 1][2];
    const len = Math.min(8 + power * MAXLEN * 0.95, total - s0);
    if (len < 6) return;
    const hl = Math.min(9, 5 + len * 0.12);
    const sh = Math.max(1, len - hl);
    passes(ctx, (g) => {
      for (let s = s0; s <= s0 + sh + 0.5; s += 0.5) {
        const u = (s - s0) / sh;
        const p = at(pts, s);
        g.disk(p[0], p[1], 0.5 + 1.3 * u, mix("#ffffff", "#ff7a2a", tip * u));
      }
      const e = at(pts, s0 + len);
      const b = at(pts, s0 + len - hl);
      const hw = hl * 0.55;
      g.tri(
        [e[0] + e[2], e[1] + e[3]],
        [b[0] - b[3] * hw, b[1] + b[2] * hw],
        [b[0] + b[3] * hw, b[1] - b[2] * hw],
        mix("#ffffff", "#ff7a2a", tip),
      );
    });
  } else {
    const s0 = BALL_R + 6;
    const pts = predict(x, y, vx, vy, s0 + 10 + MAXLEN + 6, gs);
    const L = Math.min(10 + power * MAXLEN * 0.95, pts[pts.length - 1][2] - s0);
    if (L < 2) return;
    passes(ctx, (g) => {
      for (let s = 0; s <= L; s += DOT_SPACING) {
        const u = s / L;
        const D = Math.max(2, Math.round(DOT_SIZE - (DOT_SIZE - 2) * u * 0.8));
        const p = at(pts, s0 + s);
        g.dot(p[0], p[1], D, mix("#ffffff", "#ff7a2a", tip * u));
      }
    });
  }
}
