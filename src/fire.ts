// The burning ball: flames licking off it, a tail that grows with its speed, and the explosion that lights it on the third goal in a row.
import { BALL_R } from "./sprites";

const RAMP = ["#fff6c0", "#ffd24a", "#ff9a2a", "#e8392b", "#a8281a"];
const R = BALL_R;
const rnd = (a: number, b: number): number => a + Math.random() * (b - a);

interface Part {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  g: number;
  kind: "flame" | "smoke" | "ember";
  front: boolean;
  shrink: number;
  grow: number;
}

interface Shard {
  x: number;
  y: number;
  vx: number;
  vy: number;
  col: string;
  sz: number;
  age: number;
  life: number;
}

export interface FireBall {
  x: number;
  y: number;
  /** pixels per second */
  vx: number;
  vy: number;
}

function blob(c: CanvasRenderingContext2D, cx: number, cy: number, rad: number, cols: string[]): void {
  for (let k = 0; k < cols.length; k++) {
    const rr = Math.round(rad * (1 - k * 0.22));
    if (rr < 1) break;
    c.fillStyle = cols[k];
    for (let dy = -rr; dy <= rr; dy++) {
      const w = Math.floor(Math.sqrt(rr * rr - dy * dy));
      c.fillRect(Math.round(cx) - w, Math.round(cy) + dy, w * 2 + 1, 1);
    }
  }
}

export class BallFire {
  private p: Part[] = [];
  private sh: Shard[] = [];
  private glow = 0;
  private acc = 0;
  private tacc = 0;
  private flash = 0;
  private flashAt: [number, number] | null = null;
  private seq: number | null = null;
  private f1 = false;
  private f2 = false;
  /** While > 0: sparks circle in on the ball before it catches fire again. */
  private pre: number | null = null;
  /** How the ball lights up: pop = a fireball, shatter = it breaks into pieces and re-forms. */
  mode: "pop" | "shatter" = "pop";
  private ball: FireBall = { x: 0, y: 0, vx: 0, vy: 0 };

  private add(o: Partial<Part>): void {
    this.p.push({ x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 0.5, size: 3, g: 0, kind: "flame", front: false, shrink: 0.8, grow: 0, ...o });
  }

  private burst(n: number, spd: number): void {
    const b = this.ball;
    for (let i = 0; i < n; i++) {
      const a = rnd(0, 6.283);
      this.add({ x: b.x + Math.cos(a) * R * 0.6, y: b.y + Math.sin(a) * R * 0.6, vx: Math.cos(a) * rnd(30, spd), vy: Math.sin(a) * rnd(30, spd) - 30, life: rnd(0.35, 0.7), size: rnd(5, 9), front: true, shrink: 1 });
    }
  }

  /** The third goal in a row: the ball bursts into pieces that come back together burning. */
  ignite(): void {
    this.seq = 0;
    this.f1 = false;
    this.f2 = false;
    this.sh = [];
  }

  /** The scene came back and the streak is still alive: sparks circle in and the ball catches fire again. */
  relight(): void {
    this.pre = 0;
    this.seq = null;
    this.sh = [];
  }

  /** Put out at once, with smoke. */
  extinguish(x: number, y: number): void {
    this.pre = null;
    this.seq = null;
    this.sh = [];
    this.glow = 0;
    for (let i = 0; i < 32; i++) this.add({ kind: "smoke", x: x + rnd(-6, 6), y: y + rnd(-6, 6), vx: rnd(-14, 14), vy: rnd(-40, -15), life: rnd(0.7, 1.3), size: rnd(3, 6), grow: 12 });
  }

  bounce(x: number, y: number): void {
    for (let i = 0; i < 22; i++) this.add({ x, y: y + R * 0.7, vx: rnd(-90, 90), vy: -rnd(40, 130), g: 260, life: rnd(0.3, 0.7), size: rnd(1.5, 2.5), shrink: 0.3, front: true });
  }

  /** True while anything is still burning, flying or fading, so the game keeps drawing until it is all gone. */
  active(): boolean {
    return this.p.length > 0 || this.sh.length > 0 || this.seq !== null || this.pre !== null || this.flash > 0 || this.glow > 0.01;
  }

  /** False while the ball is in pieces. */
  visible(): boolean {
    const t = this.seq;
    if (t === null) return true;
    return this.mode === "pop" ? t < 0.12 || t >= 0.4 : t < 0.1 || t >= 0.9;
  }

  /** How far the picture is knocked off centre by the blast. */
  shake(): [number, number] {
    const t = this.seq;
    if (t === null || this.mode !== "pop" || t < 0.1 || t > 0.4) return [0, 0];
    const amp = Math.max(0, 1 - (t - 0.1) / 0.3) * 2.5;
    return [Math.round(rnd(-amp, amp)), Math.round(rnd(-amp, amp))];
  }

  /** How much bigger the ball is drawn (it swells just before it pops). */
  scale(): number {
    return this.mode === "pop" && this.seq !== null && this.seq < 0.12 ? 1 + 0.25 * (this.seq / 0.12) : 1;
  }

  private ramp(): number {
    const t = this.seq;
    if (t === null) return 1;
    return this.mode === "pop" ? (t < 0.4 ? 0 : Math.min(1, (t - 0.4) / 0.3)) : t < 0.9 ? 0 : Math.min(1, (t - 0.9) / 0.3);
  }

  update(dt: number, b: FireBall, floorY: number, on: boolean): void {
    this.ball = b;
    if (this.pre !== null) {
      this.pre += dt;
      if (this.pre >= 0.45) {
        this.pre = null;
        this.flash = 1;
        this.flashAt = [b.x, b.y];
        this.burst(24, 90);
      }
    }
    if (this.seq !== null) {
      this.seq += dt;
      if (this.seq > 2.4) {
        this.seq = null;
        this.sh = [];
      }
    }
    const t = this.seq;
    for (const q of this.p) {
      q.age += dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.vy += q.g * dt;
    }
    this.p = this.p.filter((q) => q.age < q.life);
    this.flash = Math.max(0, this.flash - dt * 2.2);
    if (t !== null) {
      const pop = this.mode === "pop";
      if (!this.f1 && t >= (pop ? 0.12 : 0.1)) {
        this.f1 = true;
        this.flash = 1;
        this.flashAt = [b.x, b.y];
        const n = pop ? 24 : 30;
        for (let i = 0; i < n; i++) {
          const a = rnd(0, 6.283);
          const sp = pop ? rnd(60, 150) : rnd(56, 140);
          this.sh.push({ x: b.x + Math.cos(a) * rnd(0, R * 0.6), y: b.y + Math.sin(a) * rnd(0, R * 0.6), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30, col: ["#e8731f", "#e8731f", "#e8731f", "#ffa94d", "#7a3a10", "#1c1c22"][i % 6], sz: i % 4 === 0 ? 3 : 2, age: 0, life: pop ? 0.9 * rnd(0.8, 1.2) : 99 });
        }
        if (pop) this.burst(36, 130);
      }
      if (!this.f2 && t >= (pop ? 0.4 : 0.9)) {
        this.f2 = true;
        this.flash = pop ? 0.8 : 1;
        this.flashAt = [b.x, b.y];
        this.burst(pop ? 20 : 30, pop ? 90 : 100);
      }
    }
    for (const q of this.sh) {
      q.age += dt;
      if (this.mode === "shatter" && t !== null && t > 0.65) {
        const k = Math.min(1, (t - 0.65) / 0.25);
        q.x += (b.x - q.x) * Math.min(1, dt * 10 * k + 0.02);
        q.y += (b.y - q.y) * Math.min(1, dt * 10 * k + 0.02);
      } else {
        q.x += q.vx * dt;
        q.y += q.vy * dt;
        q.vy += 220 * dt;
        q.vx *= 1 - 1.2 * dt;
        if (q.y > floorY - 2) {
          q.y = floorY - 2;
          q.vy *= -0.4;
        }
      }
      if (t !== null && (this.mode === "pop" || t < 0.9) && Math.random() < 0.55) this.add({ x: q.x, y: q.y, vx: rnd(-8, 8), vy: -rnd(10, 30), life: rnd(0.2, 0.4), size: rnd(3, 5), shrink: 1 });
    }
    if (this.mode === "pop") this.sh = this.sh.filter((q) => q.age < q.life);
    const r = this.pre !== null ? 0 : this.ramp();
    this.glow += ((on && r > 0.001 ? 1 : 0) - this.glow) * Math.min(1, dt * 6);
    if (!on || r <= 0.001) return;
    // flames licking off the whole ball
    this.acc += dt * 240 * r;
    while (this.acc >= 1) {
      this.acc--;
      const a = rnd(0, 6.283);
      const d = R * rnd(0.4, 0.95);
      this.add({ x: b.x + Math.cos(a) * d, y: b.y + Math.sin(a) * d * 0.9, vx: -b.vx * 0.3 + rnd(-12, 12), vy: -rnd(35, 75) - b.vy * 0.04, life: rnd(0.35, 0.6), size: rnd(5, 9), front: Math.sin(a) > 0.3 && Math.random() < 0.5, shrink: 1 });
    }
    // a tail that grows with the speed
    const sp = Math.hypot(b.vx, b.vy);
    this.tacc += dt * 120 * r * Math.min(1, sp / 170);
    while (this.tacc >= 1) {
      this.tacc--;
      this.add({ x: b.x + rnd(-3, 3), y: b.y + rnd(-3, 3), vx: -b.vx * 0.05 + rnd(-6, 6), vy: -rnd(8, 26), life: rnd(0.3, 0.5), size: rnd(6, 9), shrink: 1 });
    }
    if (Math.random() < dt * 30 * r) this.add({ x: b.x + rnd(-5, 5), y: b.y + rnd(-5, 5), vx: -b.vx * rnd(0.1, 0.4) + rnd(-20, 20), vy: rnd(-70, 10), g: 220, life: rnd(0.4, 0.8), size: rnd(1.5, 2.5), shrink: 0.3, front: true });
    if (Math.random() < dt * 26 * r) this.add({ kind: "ember", x: b.x + rnd(-8, 8), y: b.y + rnd(-6, 6), vx: -b.vx * 0.1 + rnd(-12, 12), vy: -rnd(30, 60), life: rnd(0.7, 1.3) });
  }

  private parts(c: CanvasRenderingContext2D, front: boolean): void {
    for (const q of this.p) {
      if (q.front !== front) continue;
      const u = q.age / q.life;
      if (q.kind === "smoke") {
        c.globalAlpha = 0.4 * (1 - u);
        c.fillStyle = "#4a4a56";
        const s = q.size + q.grow * u;
        c.fillRect(Math.round(q.x - s / 2), Math.round(q.y - s / 2), Math.round(s), Math.round(s));
        c.globalAlpha = 1;
      } else if (q.kind === "ember") {
        c.fillStyle = u < 0.6 ? "#ffd24a" : "#ff8a1f";
        c.fillRect(Math.round(q.x), Math.round(q.y), 1, 1);
      } else {
        const s = Math.max(1, Math.round(q.size * (1 - u * q.shrink)));
        c.fillStyle = RAMP[Math.min(4, Math.floor(u * 5))];
        c.fillRect(Math.round(q.x - s / 2), Math.round(q.y - s / 2), s, s);
      }
    }
  }

  /** Flames and glow behind the ball. */
  drawBack(c: CanvasRenderingContext2D): void {
    if (this.glow > 0.01) {
      const b = this.ball;
      for (const [rad, al] of [[R + 10, 0.1], [R + 6, 0.14], [R + 3, 0.2]]) {
        c.globalAlpha = Math.min(0.5, al * 1.2) * this.glow;
        c.fillStyle = "#ff8a1f";
        c.beginPath();
        c.arc(b.x, b.y, rad, 0, 6.283);
        c.fill();
      }
      c.globalAlpha = 1;
    }
    this.parts(c, false);
  }

  /** Flames, sparks and the explosion in front of the ball. */
  drawFront(c: CanvasRenderingContext2D): void {
    const t = this.seq;
    const b = this.ball;
    if (t !== null && this.mode === "shatter" && t >= 0.1 && t < 0.9) {
      c.globalAlpha = Math.max(0, 0.5 - (t - 0.1));
      blob(c, b.x, b.y, 12, ["#ff9a2a", "#fff6c0"]);
      c.globalAlpha = 1;
    }
    if (t !== null && this.mode === "pop" && t >= 0.12 && t < 0.5) {
      const u = (t - 0.12) / 0.38;
      const rad = 34 * Math.sin(Math.min(1, u * 1.2) * Math.PI * 0.5) * (1 - Math.max(0, u - 0.6) * 1.6);
      if (rad > 1) blob(c, b.x, b.y, rad, ["#a8281a", "#e8392b", "#ff9a2a", "#ffd24a", "#fff6c0"]);
    }
    if (this.pre !== null) {
      const k = 1 - this.pre / 0.45;
      for (let i = 0; i < 6; i++) {
        const a = this.pre * 14 + i * 1.047;
        const rad = R + 4 + 22 * k * k;
        c.fillStyle = i % 2 ? "#ffd24a" : "#fff6c0";
        c.fillRect(Math.round(b.x + Math.cos(a) * rad - 1), Math.round(b.y + Math.sin(a) * rad - 1), 3, 3);
      }
    }
    for (const q of this.sh) {
      c.fillStyle = q.col;
      c.fillRect(Math.round(q.x), Math.round(q.y), q.sz, q.sz);
    }
    this.parts(c, true);
    if (this.flash > 0 && this.flashAt) {
      const [x, y] = this.flashAt;
      const rad = R + (1 - this.flash) * 38;
      c.globalAlpha = this.flash * 0.9;
      c.strokeStyle = "#fff6c0";
      c.lineWidth = 3;
      c.beginPath();
      c.arc(x, y, rad, 0, 6.283);
      c.stroke();
      c.strokeStyle = "#ff9a2a";
      c.lineWidth = 2;
      c.beginPath();
      c.arc(x, y, rad * 0.8, 0, 6.283);
      c.stroke();
      c.globalAlpha = 1;
    }
  }

  /** A faint white flash over the whole picture. */
  overlay(c: CanvasRenderingContext2D, w: number, h: number): void {
    const t = this.seq;
    if (t === null) return;
    const a =
      this.mode === "pop"
        ? t > 0.1 && t < 0.3 ? 0.4 - (t - 0.1) * 2 : 0
        : t > 0.1 && t < 0.25 ? 0.3 * (1 - (t - 0.1) / 0.15) : t > 0.9 && t < 1.1 ? 0.35 * (1 - (t - 0.9) / 0.2) : 0;
    if (a > 0) {
      c.globalAlpha = a;
      c.fillStyle = "#fff6c0";
      c.fillRect(-4, -4, w + 8, h + 8);
      c.globalAlpha = 1;
    }
  }
}
