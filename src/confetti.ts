import { rnd } from "./draw";

const DUR = 2800;

const toU32 = (hex: string): number => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
};

const PAL = ["#e8392b", "#f58a2e", "#f5c518", "#3fb950", "#2f9be8", "#e85bb0"].map(toU32);
const WHITE = toU32("#ffffff");
const DARKC = toU32("#1c1c22");

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  delay: number;
  phase: number;
  freq: number;
  col: number;
  streamer: boolean;
  trail: [number, number][];
}

export class Confetti {
  active = false;
  private pieces: Piece[] = [];
  private t = 0;
  private w = 0;
  private h = 0;
  private cv = document.createElement("canvas");
  private cctx = this.cv.getContext("2d")!;
  private img!: ImageData;
  private u32!: Uint32Array;
  private xs: number[] = [];
  private ys: number[] = [];
  private cs: number[] = [];

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.cv.width = w;
    this.cv.height = h;
    this.img = this.cctx.createImageData(w, h);
    this.u32 = new Uint32Array(this.img.data.buffer);
  }

  spawn(amount: number): void {
    const area = (this.w * this.h) / 30000;
    const count = Math.min(1600, Math.round(amount * area * 0.2));
    if (count <= 0) return;
    const sc = this.h / 125;
    const per = 2 * (this.w + this.h);
    this.pieces = [];
    for (let i = 0; i < count; i++) {
      const r = Math.random() * per;
      let x: number;
      let y: number;
      if (r < this.w) {
        x = r;
        y = -3;
      } else if (r < 2 * this.w) {
        x = r - this.w;
        y = this.h + 3;
      } else if (r < 2 * this.w + this.h) {
        x = -3;
        y = r - 2 * this.w;
      } else {
        x = this.w + 3;
        y = r - 2 * this.w - this.h;
      }
      const tx = this.w * rnd(0.18, 0.82);
      const ty = this.h * rnd(0.15, 0.7);
      const dx = tx - x;
      const dy = ty - y;
      const d = Math.hypot(dx, dy) || 1;
      const k = 1.3;
      const sp = k * d * rnd(0.8, 1.2);
      this.pieces.push({
        x,
        y,
        vx: (dx / d) * sp,
        vy: (dy / d) * sp,
        delay: rnd(0, 260),
        phase: rnd(0, 6.28),
        freq: rnd(0.008, 0.016),
        col: PAL[i % PAL.length],
        streamer: Math.random() < 0.4,
        trail: [],
      });
    }
    this.gravity = 30 * sc;
    this.t = 0;
    this.active = true;
  }

  private gravity = 30;

  update(ms: number): void {
    if (!this.active) return;
    this.t += ms;
    if (this.t >= DUR) {
      this.active = false;
      this.pieces = [];
      return;
    }
    const dt = ms / 1000;
    const k = Math.exp(-1.3 * dt);
    for (const p of this.pieces) {
      if (this.t < p.delay) continue;
      p.vx *= k;
      p.vy = p.vy * k + this.gravity * dt;
      p.x += p.vx * dt + Math.sin(this.t * p.freq + p.phase) * 0.25;
      p.y += p.vy * dt;
      if (p.streamer) {
        p.trail.push([p.x, p.y]);
        if (p.trail.length > 13) p.trail.shift();
      }
    }
  }

  private add(x: number, y: number, c: number): void {
    this.xs.push(x);
    this.ys.push(y);
    this.cs.push(c);
  }

  draw(target: CanvasRenderingContext2D): void {
    if (!this.active) return;
    const fade = Math.min(1, Math.max(0, (this.t - 2000) / 800));
    const f = 1 - fade;
    this.xs.length = 0;
    this.ys.length = 0;
    this.cs.length = 0;
    for (const p of this.pieces) {
      if (this.t < p.delay) continue;
      if (p.streamer) {
        if (p.trail.length < 2) continue;
        const pts = p.trail;
        let idx = 0;
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1];
          const b = pts[i];
          const st = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])));
          for (let s = 0; s < st; s++) {
            const x = Math.round(a[0] + ((b[0] - a[0]) * s) / st);
            const y = Math.round(a[1] + ((b[1] - a[1]) * s) / st);
            const c = (idx++ >> 2) % 2 ? p.col : WHITE;
            this.add(x, y, c);
            this.add(x + 1, y, c);
            this.add(x, y + 1, c);
            this.add(x + 1, y + 1, c);
          }
        }
      } else {
        const s = 2;
        const x0 = Math.round(p.x);
        const y0 = Math.round(p.y);
        for (let yy = 0; yy < s; yy++) for (let xx = 0; xx < s; xx++) this.add(x0 + xx, y0 + yy, p.col);
      }
    }
    const u = this.u32;
    u.fill(0);
    const w = this.w;
    const h = this.h;
    const n = this.xs.length;
    for (let i = 0; i < n; i++) {
      const x = this.xs[i];
      const y = this.ys[i];
      for (let j = -1; j <= 1; j++) {
        const yy = y + j;
        if (yy < 0 || yy >= h) continue;
        for (let k = -1; k <= 1; k++) {
          const xx = x + k;
          if (xx >= 0 && xx < w) u[yy * w + xx] = DARKC;
        }
      }
    }
    for (let i = 0; i < n; i++) {
      const x = this.xs[i];
      const y = this.ys[i];
      if (x >= 0 && x < w && y >= 0 && y < h) u[y * w + x] = this.cs[i];
    }
    this.cctx.putImageData(this.img, 0, 0);
    const prev = target.globalAlpha;
    target.globalAlpha = prev * f;
    target.drawImage(this.cv, 0, 0);
    target.globalAlpha = prev;
  }
}
