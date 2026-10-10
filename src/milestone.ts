import { clamp, layer, rnd, textRows, textWidth } from "./draw";

const DUR = 4400;
const FADE = 600;

const hsl = (h: number, s: number, l: number): string => {
  h = ((h % 360) + 360) % 360;
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number): number => {
    const k = (n + h / 30) % 12;
    return l / 100 - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
  };
  return `rgb(${Math.round(255 * f(0))},${Math.round(255 * f(8))},${Math.round(255 * f(4))})`;
};

interface Rocket {
  x: number;
  y: number;
  ty: number;
  vy: number;
  hue: number;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  col: string;
}

export class Milestone {
  active = false;
  private n = 0;
  private t = 0;
  private w = 0;
  private h = 0;
  private launches: number[] = [];
  private rockets: Rocket[] = [];
  private sparks: Spark[] = [];

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
  }

  start(n: number): void {
    this.n = n;
    this.t = 0;
    this.active = true;
    this.rockets = [];
    this.sparks = [];
    this.launches = [];
    for (let i = 0; i < 9; i++) this.launches.push(250 + i * 340 + rnd(0, 140));
  }

  stop(): void {
    this.active = false;
    this.rockets = [];
    this.sparks = [];
  }

  update(ms: number): void {
    if (!this.active) return;
    this.t += ms;
    if (this.t >= DUR) {
      this.stop();
      return;
    }
    const dt = ms / 1000;
    const sc = this.h / 125;
    while (this.launches.length && this.t >= this.launches[0]) {
      this.launches.shift();
      const ty = this.h * rnd(0.1, 0.45);
      this.rockets.push({
        x: this.w * rnd(0.12, 0.88),
        y: this.h + 2,
        ty,
        vy: -(this.h - ty) / rnd(0.55, 0.8),
        hue: rnd(0, 360),
      });
    }
    this.rockets = this.rockets.filter((r) => {
      r.y += r.vy * dt;
      if (r.y > r.ty) return true;
      const cnt = 34;
      const off = rnd(0, 6.28);
      for (let i = 0; i < cnt; i++) {
        const a = off + (i / cnt) * 6.28;
        const sp = rnd(28, 58) * sc;
        this.sparks.push({
          x: r.x,
          y: r.y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          age: 0,
          life: rnd(900, 1300),
          col: hsl(r.hue + (i % 2) * 40, 95, i % 5 === 0 ? 88 : 60),
        });
      }
      return false;
    });
    const k = Math.exp(-1.9 * dt);
    this.sparks = this.sparks.filter((s) => {
      s.age += ms;
      s.vx *= k;
      s.vy = s.vy * k + 20 * sc * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      return s.age < s.life;
    });
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (!this.active) return;
    const e = this.t;
    const al = clamp(e > DUR - FADE ? (DUR - e) / FADE : 1, 0, 1);
    ctx.globalAlpha = clamp(e / 300, 0, 1) * al * 0.38;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.globalAlpha = al;

    for (const r of this.rockets) {
      const x = Math.round(r.x);
      const y = Math.round(r.y);
      ctx.fillStyle = "#1c1c22";
      ctx.fillRect(x - 1, y - 1, 3, 9);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x, y, 1, 3);
      ctx.fillStyle = "#ffb257";
      ctx.fillRect(x, y + 3, 1, 4);
    }
    for (const s of this.sparks) {
      const sz = s.age > s.life * 0.65 ? 1 : 2;
      ctx.fillStyle = "#1c1c22";
      ctx.fillRect(Math.round(s.x) - 1, Math.round(s.y) - 1, sz + 2, sz + 2);
    }
    for (const s of this.sparks) {
      const sz = s.age > s.life * 0.65 ? 1 : 2;
      if (s.age > s.life * 0.8 && Math.floor(s.age / 60) % 2) continue;
      ctx.fillStyle = s.col;
      ctx.fillRect(Math.round(s.x), Math.round(s.y), sz, sz);
    }

    const str = String(this.n);
    const base = str.length <= 3 ? 7 : 5;
    const pop = e < 350 ? Math.round((1 - e / 350) * 3) : 0;
    const s = base + pop;
    const cx = this.w / 2;
    const cy = this.h / 2;
    const sh = e < 400 ? Math.round(Math.sin(e / 25) * 2) : 0;

    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * 2 * Math.PI + e / 900;
      const x1 = Math.round(cx + Math.cos(a) * (70 + (i % 2) * 20));
      const y1 = Math.round(cy + Math.sin(a) * (50 + (i % 2) * 14));
      ctx.fillStyle = i % 2 ? "#b8861a" : "#ffcf40";
      let ax = Math.round(cx + Math.cos(a) * 12);
      let ay = Math.round(cy + Math.sin(a) * 8);
      const dx = Math.abs(x1 - ax);
      const dy = -Math.abs(y1 - ay);
      const sx = ax < x1 ? 1 : -1;
      const sy = ay < y1 ? 1 : -1;
      let er = dx + dy;
      let c = 0;
      for (;;) {
        if (c++ % 4 < 2) ctx.fillRect(ax, ay, 1, 1);
        if (ax === x1 && ay === y1) break;
        const e2 = 2 * er;
        if (e2 >= dy) {
          er += dy;
          ax += sx;
        }
        if (e2 <= dx) {
          er += dx;
          ay += sy;
        }
      }
    }

    const gx = Math.round(cx - textWidth(str, s) / 2) + sh;
    const gy = Math.round(cy - s * 4 - 8);
    layer(ctx, (put) => textRows(put, str, gx, gy, s, (r) => hsl(e / 6 + r * 22, 90, 62)));
    const flick = Math.floor(e / 140) % 2 === 0;
    layer(ctx, (put) =>
      textRows(put, "GOAL!", Math.round(cx - textWidth("GOAL!", 3) / 2) + sh, gy + s * 8 + 4, 3, () =>
        flick ? "#fff6a0" : "#ffffff",
      ),
    );
    ctx.globalAlpha = 1;
  }
}
