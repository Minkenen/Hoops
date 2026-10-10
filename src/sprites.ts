import { DARK, HALO } from "./draw";

const BALL = ["#b8451a", "#ee7a24", "#ffa94d"];

function haloCanvas(pix: (string | null)[], w: number, h: number): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const g = cv.getContext("2d")!;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = pix[y * w + x];
      if (c) {
        g.fillStyle = c;
        g.fillRect(x, y, 1, 1);
        continue;
      }
      let nb = false;
      for (let dy = -1; dy <= 1 && !nb; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < w && yy < h && pix[yy * w + xx]) {
            nb = true;
            break;
          }
        }
      }
      if (nb) {
        g.fillStyle = HALO;
        g.fillRect(x, y, 1, 1);
      }
    }
  }
  return cv;
}

export const BALL_R = 10.5;
export const BALL_SPRITE_SIZE = 23;

function ballPixels(angle: number): (string | null)[] {
  const N = 21;
  const S = N + 2;
  const c0 = (N - 1) / 2;
  const Rr = N / 2;
  const pix: (string | null)[] = new Array(S * S).fill(null);
  const lx = -0.5;
  const ly = -0.6;
  const lz = 0.65;
  const ln = Math.hypot(lx, ly, lz);
  const ca = Math.cos(-angle);
  const sa = Math.sin(-angle);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const d = Math.hypot(x - c0, y - c0);
      if (d > Rr) continue;
      const dx = (x - c0) / Rr;
      const dy = (y - c0) / Rr;
      const nz = Math.sqrt(Math.max(0, 1 - dx * dx - dy * dy));
      const v = Math.max(0, (dx * lx + dy * ly + nz * lz) / ln) + 0.1;
      let c = v > 0.78 ? BALL[2] : v > 0.42 ? BALL[1] : BALL[0];
      const u = dx * ca - dy * sa;
      const w = dx * sa + dy * ca;
      const seam =
        Math.abs(u) < 0.075 ||
        Math.abs(w) < 0.075 ||
        Math.abs(Math.hypot(u + 1.344, w) - 1.075) < 0.07 ||
        Math.abs(Math.hypot(u - 1.344, w) - 1.075) < 0.07;
      if (seam) c = DARK;
      if (d > Rr - 1.2) c = DARK;
      else if (Math.hypot((x - (c0 - 0.38 * Rr)) / 1.7, (y - (c0 - 0.46 * Rr)) / 1.1) < 1) c = "#ffffff";
      pix[(y + 1) * S + x + 1] = c;
    }
  }
  return pix;
}

export const BALL_FRAMES = 72;

export function makeBallFrames(): HTMLCanvasElement[] {
  const S = BALL_SPRITE_SIZE;
  const out: HTMLCanvasElement[] = [];
  for (let i = 0; i < BALL_FRAMES; i++) {
    out.push(haloCanvas(ballPixels((i / BALL_FRAMES) * 2 * Math.PI), S, S));
  }
  return out;
}

export interface NetGeom {
  cols: number;
  rows: number;
  x: number[];
  y: number[];
  depth: number[];
}

export interface HoopSprite {
  canvas: HTMLCanvasElement;
  front: HTMLCanvasElement;
  w: number;
  h: number;
  frontX: number;
  backX: number;
  rimY: number;
  rimCx: number;
  netLen: number;
  hull: [number, number][];
  netGeom: NetGeom;
  shiftX: number;
  shiftY: number;
}

type Pt = [number, number];

function inPoly(x: number, y: number, pts: Pt[]): boolean {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}

const ISO_W = 80;
const ISO_H = 88;
const RING_R = 13;
const NET_T = [0, 0.42, 0.72, 1];
const NET_COLS = 12;

class Iso {
  base: (string | null)[];
  front: (string | null)[];
  cur: (string | null)[];
  constructor(
    readonly side: "left" | "right",
    readonly ox: number,
    readonly oy: number,
    readonly h: number = ISO_H,
  ) {
    this.base = new Array(ISO_W * h).fill(null);
    this.front = new Array(ISO_W * h).fill(null);
    this.cur = this.base;
  }
  p(a: number, b: number, z: number): Pt {
    const x = this.side === "right" ? a : b;
    const y = this.side === "right" ? b : a;
    return [this.ox + (x - y), this.oy + (x + y) * 0.5 - z];
  }
  set(x: number, y: number, c: string): void {
    const xx = Math.round(x);
    const yy = Math.round(y);
    if (xx >= 0 && yy >= 0 && xx < ISO_W && yy < this.h) this.cur[yy * ISO_W + xx] = c;
  }
  line(A: Pt, B: Pt, c: string): void {
    let x0 = Math.round(A[0]);
    let y0 = Math.round(A[1]);
    const x1 = Math.round(B[0]);
    const y1 = Math.round(B[1]);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let e = dx + dy;
    for (;;) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * e;
      if (e2 >= dy) {
        e += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        e += dx;
        y0 += sy;
      }
    }
  }
  poly(pts: Pt[], c: string): void {
    let mnx = 1e9;
    let mxx = -1e9;
    let mny = 1e9;
    let mxy = -1e9;
    for (const p of pts) {
      mnx = Math.min(mnx, p[0]);
      mxx = Math.max(mxx, p[0]);
      mny = Math.min(mny, p[1]);
      mxy = Math.max(mxy, p[1]);
    }
    for (let y = Math.max(0, Math.floor(mny)); y <= Math.min(this.h - 1, Math.ceil(mxy)); y++) {
      for (let x = Math.max(0, Math.floor(mnx)); x <= Math.min(ISO_W - 1, Math.ceil(mxx)); x++) {
        if (inPoly(x + 0.5, y + 0.5, pts)) this.set(x, y, c);
      }
    }
  }
  outline(pts: Pt[], c: string): void {
    for (let i = 0; i < pts.length; i++) this.line(pts[i], pts[(i + 1) % pts.length], c);
  }
  box(
    a0: number,
    a1: number,
    b0: number,
    b1: number,
    z0: number,
    z1: number,
    cols: { top: string; front: string; side: string },
    out: string,
  ): void {
    const P = (a: number, b: number, z: number) => this.p(a, b, z);
    const top = [P(a0, b0, z1), P(a1, b0, z1), P(a1, b1, z1), P(a0, b1, z1)];
    const front = [P(a0, b1, z1), P(a1, b1, z1), P(a1, b1, z0), P(a0, b1, z0)];
    const side = [P(a1, b0, z1), P(a1, b1, z1), P(a1, b1, z0), P(a1, b0, z0)];
    this.poly(top, cols.top);
    this.poly(side, cols.side);
    this.poly(front, cols.front);
    this.outline(top, out);
    this.outline(side, out);
    this.outline(front, out);
  }
}

function ringArc(iso: Iso, front: boolean): void {
  const n = 260;
  for (let i = 0; i < n; i++) {
    const th = (i / n) * 2 * Math.PI;
    const isFront = Math.cos(th) + Math.sin(th) >= 0;
    if (isFront !== front) continue;
    const a = RING_R * Math.cos(th);
    const b = RING_R * Math.sin(th);
    for (let k = 0; k < 3; k++) {
      const pt = iso.p(a, b, -k);
      let col: string;
      if (front) {
        const lit = Math.cos(th) - Math.sin(th) < 0;
        col = k === 0 ? (lit ? "#ff9a50" : "#f2782a") : k === 2 ? "#d8561c" : lit ? "#f2782a" : "#d8561c";
      } else {
        col = "#7a3010";
      }
      iso.set(pt[0], pt[1], col);
    }
    if (front) {
      const p0 = iso.p(a, b, 1);
      const p1 = iso.p(a, b, -3);
      iso.set(p0[0], p0[1], DARK);
      iso.set(p1[0], p1[1], DARK);
    }
  }
}

export function makeHoopSprite(side: "left" | "right"): HoopSprite {
  const iso = new Iso(side, side === "right" ? 26 : 50, 44);
  const bF = -RING_R - 3;
  const bB = -RING_R - 6;
  const aW = 12;
  const zLo = -9;
  const zHi = 19;
  iso.box(-aW, aW, bB, bF, zLo, zHi, { top: "#f2f4f7", front: "#eaf1f5", side: "#8a909c" }, DARK);
  const P = (a: number, b: number, z: number) => iso.p(a, b, z);
  const inner = [P(-aW + 2, bF, zHi - 2), P(aW - 2, bF, zHi - 2), P(aW - 2, bF, zLo + 2), P(-aW + 2, bF, zLo + 2)];
  iso.poly(inner, "#d4e0e8");
  iso.poly(
    [
      P(-aW + 2, bF, (zHi + zLo) / 2 - 3),
      P(aW - 2, bF, (zHi + zLo) / 2 - 3),
      P(aW - 2, bF, zLo + 2),
      P(-aW + 2, bF, zLo + 2),
    ],
    "#b8c8d4",
  );
  iso.outline(inner, "#8a909c");
  iso.outline([P(-5, bF, 1), P(5, bF, 1), P(5, bF, 10), P(-5, bF, 10)], "#d8402f");
  iso.box(-1, 1, bB + 3, -RING_R, -2, 0, { top: "#c4c9d2", front: "#8a909c", side: "#4a4f5a" }, DARK);
  ringArc(iso, false);
  iso.cur = iso.front;
  ringArc(iso, true);

  let minX = ISO_W;
  let maxX = 0;
  let minY = ISO_H;
  let maxY = 0;
  for (const arr of [iso.base, iso.front]) {
    for (let y = 0; y < ISO_H; y++) {
      for (let x = 0; x < ISO_W; x++) {
        if (arr[y * ISO_W + x]) {
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
      }
    }
  }
  const sx = minX - 1;
  const sy = minY - 1;
  const w = maxX - minX + 3;
  const h = maxY - minY + 3;
  const crop = (arr: (string | null)[]) => {
    const out: (string | null)[] = new Array(w * h).fill(null);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const xx = x + sx;
        const yy = y + sy;
        if (xx >= 0 && yy >= 0 && xx < ISO_W && yy < ISO_H) out[y * w + x] = arr[yy * ISO_W + xx];
      }
    }
    return haloCanvas(out, w, h);
  };

  const geomRows = NET_T.length;
  const gx: number[] = [];
  const gy: number[] = [];
  const gd: number[] = [];
  for (let r = 0; r < geomRows; r++) {
    const t = NET_T[r];
    const rad = (RING_R - 1) * (1 - t) + 8 * t;
    for (let k = 0; k < NET_COLS; k++) {
      const th = ((k + (r & 1 ? 0.5 : 0)) / NET_COLS) * 2 * Math.PI;
      const a = rad * Math.cos(th);
      const b = rad * Math.sin(th);
      const pt = iso.p(a, b, -24 * t);
      gx.push(pt[0] - sx);
      gy.push(pt[1] - sy);
      gd.push(a + b);
    }
  }

  const cut = (a: number, b: number, z: number): Pt => {
    const pt = iso.p(a, b, z);
    return [pt[0] - sx, pt[1] - sy];
  };
  const hull: Pt[] = [cut(0, bB, zHi), cut(0, bF, zHi), cut(0, bF, zLo), cut(0, bB, zLo)];
  const reach = RING_R * Math.SQRT2;
  const cxr = iso.ox - sx;
  const open = side === "right" ? cxr - reach : cxr + reach;
  const closed = side === "right" ? cxr + reach : cxr - reach;
  return {
    canvas: crop(iso.base),
    front: crop(iso.front),
    w,
    h,
    frontX: open,
    backX: closed,
    rimY: iso.oy - sy,
    rimCx: cxr,
    netLen: 26,
    hull,
    shiftX: sx,
    shiftY: sy,
    netGeom: { cols: NET_COLS, rows: geomRows, x: gx, y: gy, depth: gd },
  };
}

export function makePoleSprite(side: "left" | "right", height: number): HTMLCanvasElement {
  const h = Math.max(8, Math.ceil(height));
  const ox = side === "right" ? 26 : 50;
  const oy = 44;
  const iso = new Iso(side, ox, oy, h);
  const cols = { top: "#c4c9d2", front: "#8a909c", side: "#4a4f5a" };
  const P = (a: number, b: number, z: number) => iso.p(a, b, z);
  const bottom = -(h * 2 + 100);
  iso.box(-2, 2, -24, -20, bottom, 3, cols, DARK);
  const s0 = P(-0.9, -20, 3);
  const s1 = P(-0.9, -20, bottom);
  iso.line(s0, s1, "#dfe3ea");
  iso.box(-1, 1, -20, -RING_R - 6, -5, -2, cols, DARK);
  return haloCanvas(iso.base, ISO_W, h);
}
