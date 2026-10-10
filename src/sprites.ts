import { DARK, HALO } from "./draw";


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

function ballPixels(angle: number, BALL: string[], seamCol: string, lx = -0.5): (string | null)[] {
  const N = 21;
  const S = N + 2;
  const c0 = (N - 1) / 2;
  const Rr = N / 2;
  const pix: (string | null)[] = new Array(S * S).fill(null);
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
      if (seam) c = seamCol;
      if (d > Rr - 1.2) c = DARK;
      else if (Math.hypot((x - (c0 + 0.76 * lx * Rr)) / 1.7, (y - (c0 - 0.46 * Rr)) / 1.1) < 1) c = "#ffffff";
      pix[(y + 1) * S + x + 1] = c;
    }
  }
  return pix;
}

export const BALL_FRAMES = 72;

export function makeBallFrame(pal: string[], seam: string, lx = -0.5): HTMLCanvasElement {
  return haloCanvas(ballPixels(0.7, pal, seam, lx), BALL_SPRITE_SIZE, BALL_SPRITE_SIZE);
}

export function makeBallFrames(pal: string[], seam: string, lx = -0.5): HTMLCanvasElement[] {
  const S = BALL_SPRITE_SIZE;
  const out: HTMLCanvasElement[] = [];
  for (let i = 0; i < BALL_FRAMES; i++) {
    out.push(haloCanvas(ballPixels((i / BALL_FRAMES) * 2 * Math.PI, pal, seam, lx), S, S));
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
  faceHull: [number, number][]; // the whole visible front of the backboard
  silhouette: [number, number][]; // convex outline of the whole board box
  netGeom: NetGeom;
  shiftX: number;
  shiftY: number;
  poleTop: [[number, number], [number, number]];
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

function convexHull(pts: [number, number][]): [number, number][] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]): number =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: [number, number][] = [];
  for (const q of [...p].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

const ISO_W = 130;
const ISO_H = 150;

/** Size of the backboard in iso units: half width, and the lowest and highest edge. */
export interface BoardSpec {
  aW: number;
  zLo: number;
  zHi: number;
  gap?: number; // distance from the ring's edge to the board's front face
  targetW?: number; // half width of the painted square
  targetH?: number; // height of the painted square
}

/** The old small board. The ring keeps the spot it had with this one. */
export const OLD_BOARD: BoardSpec = { aW: 12, zLo: -9, zHi: 19 };

// 60 percent of a real board (1.71 : 1 against a 26 unit ring), with the real gap to the ring and target square.
export const DEFAULT_BOARD: BoardSpec = { aW: 31, zLo: -9, zHi: 28, gap: 7, targetW: 10, targetH: 15 };

/** The hoop and its pole sprite share one origin, so the pole lines up with whichever board is used. */
function hoopOrigin(side: "left" | "right", board: BoardSpec): { ox: number; oy: number } {
  const back = RING_R + (board.gap ?? 3) + 3; // distance from the ring centre to the back of the board
  const oy = Math.max(44, Math.ceil(board.zHi + (board.aW + back) / 2 + 6));
  const ox = side === "right" ? 26 : Math.max(50, board.aW + back + 2);
  return { ox, oy };
}
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


function isoCylinder(
  iso: Iso,
  ca: number,
  cb: number,
  r: number,
  z0: number,
  z1: number,
  shades: string[],
  topColor: string,
): void {
  const n = 72;
  const P = (a: number, b: number, z: number) => iso.p(a, b, z);
  for (let i = 0; i < n; i++) {
    const t0 = (i / n) * 2 * Math.PI;
    const t1 = ((i + 1) / n) * 2 * Math.PI;
    const tm = (t0 + t1) / 2;
    if (Math.cos(tm) + Math.sin(tm) < 0) continue;
    const lit = (Math.cos(tm) - Math.sin(tm) + Math.SQRT2) / (2 * Math.SQRT2);
    const col = shades[Math.min(shades.length - 1, Math.floor(lit * shades.length))];
    iso.poly(
      [
        P(ca + r * Math.cos(t0), cb + r * Math.sin(t0), z1),
        P(ca + r * Math.cos(t1), cb + r * Math.sin(t1), z1),
        P(ca + r * Math.cos(t1), cb + r * Math.sin(t1), z0),
        P(ca + r * Math.cos(t0), cb + r * Math.sin(t0), z0),
      ],
      col,
    );
  }
  const top: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * 2 * Math.PI;
    top.push(P(ca + r * Math.cos(t), cb + r * Math.sin(t), z1));
  }
  iso.poly(top, topColor);
  iso.outline(top, DARK);
  let prev: Pt | null = null;
  for (let i = 0; i < n; i++) {
    const t = (i / n) * 2 * Math.PI;
    if (Math.cos(t) + Math.sin(t) < 0) continue;
    const pt = P(ca + r * Math.cos(t), cb + r * Math.sin(t), z0);
    if (prev) iso.line(prev, pt, DARK);
    prev = pt;
  }
  for (const th of [(3 * Math.PI) / 4, -Math.PI / 4]) {
    iso.line(
      P(ca + r * Math.cos(th), cb + r * Math.sin(th), z1),
      P(ca + r * Math.cos(th), cb + r * Math.sin(th), z0),
      DARK,
    );
  }
}

export type BaseSkin = "plate" | "round" | "concrete";

const BASE_LOW: Record<BaseSkin, number> = {
  plate: -4,
  round: -11 + 0.7071 * 9,
  concrete: -2,
};

/** Rows from the middle of the foot to the bottom edge of the pole sprite (measured), so the foot can stand on the court's centre line. */
export const BASE_CENTER: Record<BaseSkin, number> = { plate: 14, round: 14, concrete: 18 };

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

export function makeHoopSprite(side: "left" | "right", board: BoardSpec = DEFAULT_BOARD): HoopSprite {
  const origin = hoopOrigin(side, board);
  const iso = new Iso(side, origin.ox, origin.oy);
  const bF = -RING_R - (board.gap ?? 3);
  const bB = -RING_R - 6;
  const { aW, zLo, zHi } = board;
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
  const tw = board.targetW ?? Math.round(aW * 0.42);
  const th = 1 + (board.targetH ?? Math.round((zHi - zLo) * 0.32));
  iso.outline([P(-tw, bF, 1), P(tw, bF, 1), P(tw, bF, th), P(-tw, bF, th)], "#d8402f");
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
  const faceHull: Pt[] = [cut(-aW, bF, zHi), cut(aW, bF, zHi), cut(aW, bF, zLo), cut(-aW, bF, zLo)];
  const corners: Pt[] = [];
  for (const a of [-aW, aW]) for (const b of [bB, bF]) for (const z of [zLo, zHi]) corners.push(cut(a, b, z));
  const silhouette = convexHull(corners);
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
    faceHull,
    silhouette,
    shiftX: sx,
    shiftY: sy,
    poleTop: [cut(0, -24, 3), cut(0, -20, 3)],
    netGeom: { cols: NET_COLS, rows: geomRows, x: gx, y: gy, depth: gd },
  };
}

export function makePoleSprite(
  side: "left" | "right",
  height: number,
  skin: BaseSkin = "plate",
  board: BoardSpec = DEFAULT_BOARD,
): HTMLCanvasElement {
  const h = Math.max(8, Math.ceil(height));
  const { ox, oy } = hoopOrigin(side, board);
  const iso = new Iso(side, ox, oy, h);
  const steel = { top: "#c4c9d2", front: "#8a909c", side: "#4a4f5a" };
  const P = (a: number, b: number, z: number) => iso.p(a, b, z);
  const z0 = oy + BASE_LOW[skin] - (h - 3);
  let zTop: number;
  if (skin === "plate") {
    iso.box(-7, 7, -29, -15, z0, z0 + 3, { top: "#c4c9d2", front: "#6f7682", side: "#3a3e48" }, DARK);
    for (const aa of [-5.5, 5.5]) {
      for (const bb of [-27.5, -16.5]) {
        iso.box(aa - 1, aa + 1, bb - 1, bb + 1, z0 + 3, z0 + 4.5, { top: "#eef1f5", front: "#aeb4be", side: "#6f7682" }, "");
      }
    }
    zTop = z0 + 3;
  } else if (skin === "round") {
    isoCylinder(iso, 0, -22, 9, z0, z0 + 3, ["#3a3e48", "#5a606c", "#8a909c", "#aeb4be"], "#c4c9d2");
    isoCylinder(iso, 0, -22, 6.5, z0 + 3, z0 + 6, ["#4a4f5a", "#6f7682", "#aeb4be", "#c4c9d2"], "#dfe3ea");
    isoCylinder(iso, 0, -22, 3.4, z0 + 6, z0 + 8, ["#4a4f5a", "#6f7682", "#aeb4be", "#dfe3ea"], "#eef1f5");
    zTop = z0 + 8;
  } else {
    iso.box(-9, 9, -31, -13, z0, z0 + 7, { top: "#c9c5bb", front: "#aaa69c", side: "#6e6b63" }, DARK);
    iso.box(-8, 8, -30, -14, z0 + 7, z0 + 9, { top: "#d8d4ca", front: "#b4b0a6", side: "#7a776e" }, "");
    for (let i = 0; i < 26; i++) {
      const fa = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
      const fb = Math.abs(Math.sin(i * 78.233) * 43758.5453) % 1;
      const q = P(-8 + 16 * fa, -14, z0 + 1 + 5 * fb);
      iso.set(q[0], q[1], "#8e8a80");
    }
    for (const aa of [-5.5, 5.5]) {
      const q = P(aa, -14, z0 + 5);
      iso.set(q[0], q[1], "#4a4f5a");
      iso.set(q[0] + 1, q[1], "#8a909c");
    }
    iso.box(-3.5, 3.5, -25.5, -18.5, z0 + 9, z0 + 12, { top: "#dfe3ea", front: "#8a909c", side: "#4a4f5a" }, DARK);
    zTop = z0 + 12;
  }
  iso.box(-2, 2, -24, -20, zTop, 3, steel, DARK);
  iso.line(P(-0.9, -20, 3), P(-0.9, -20, zTop), "#dfe3ea");
  iso.box(-1, 1, -20, -RING_R - 6, -5, -2, steel, DARK);
  if (skin === "plate") {
    const g1: Pt[] = [P(2, -22, zTop), P(7, -22, zTop), P(2, -22, zTop + 8)];
    iso.poly(g1, "#8a909c");
    iso.outline(g1, DARK);
    const g2: Pt[] = [P(0, -20, zTop), P(0, -15, zTop), P(0, -20, zTop + 8)];
    iso.poly(g2, "#4a4f5a");
    iso.outline(g2, DARK);
  }
  return haloCanvas(iso.base, ISO_W, h);
}
