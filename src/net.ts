export interface NetBall {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

export interface NetNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  offsetX: number;
  offsetY: number;
}

import type { NetGeom } from "./sprites";

export const NET_PARAMS = {
  kTop: 0.5,
  kBot: 0.08,
  mu: 0.12,
  damp: 0.03,
  kc: 0.5,
  grav: 0.133,
  shape: 0.012,
  edgeDamp: 0.06,
  ballMass: 30,
  maxBallAccel: 0.35,
};

/** Pure ball-to-net interaction used by the simulation; drawing never enters this calculation. */
export function netBallForce(node: NetNode, ball: NetBall): { nodeX: number; nodeY: number; ballX: number; ballY: number } {
  const dx = node.x + node.offsetX - ball.x;
  const dy = node.y + node.offsetY - ball.y;
  const dist = Math.hypot(dx, dy);
  const min = ball.r + 0.6;
  if (dist <= 0.001 || dist >= min) return { nodeX: 0, nodeY: 0, ballX: 0, ballY: 0 };
  const nx = dx / dist;
  const ny = dy / dist;
  const spring = NET_PARAMS.kc * (min - dist);
  const relativeX = ball.vx - node.vx;
  const relativeY = ball.vy - node.vy;
  const nodeX = spring * nx + NET_PARAMS.mu * relativeX;
  const nodeY = spring * ny + NET_PARAMS.mu * relativeY;
  return { nodeX, nodeY, ballX: -nodeX, ballY: -nodeY };
}

const SWAY_K = 0.05;
const SWAY_C = 0.11;
const SWAY_LIFT = 0.1;
const SWAY_GAIN = 1.5;
const SWAY_MAX = 14;
const MAX_NODE_SPEED = 6;

interface Edge {
  a: number;
  b: number;
  front: boolean;
  L: number;
  w: number;
}

export class Net {
  private n: number;
  private px: Float32Array;
  private py: Float32Array;
  private vx: Float32Array;
  private vy: Float32Array;
  private rx: Float32Array;
  private ry: Float32Array;
  private ax: Float32Array;
  private ay: Float32Array;
  private row: Int8Array;
  private front: Uint8Array;
  private ww: Float32Array;
  private edges: Edge[] = [];
  private cols: number;
  private rows: number;
  private offX = 0;
  private sway = 0;
  private swayV = 0;

  constructor(geom: NetGeom, ox: number, oy: number) {
    this.cols = geom.cols;
    this.rows = geom.rows;
    const n = (this.n = this.cols * this.rows);
    this.px = new Float32Array(n);
    this.py = new Float32Array(n);
    this.vx = new Float32Array(n);
    this.vy = new Float32Array(n);
    this.rx = new Float32Array(n);
    this.ry = new Float32Array(n);
    this.ax = new Float32Array(n);
    this.ay = new Float32Array(n);
    this.row = new Int8Array(n);
    this.front = new Uint8Array(n);
    this.ww = new Float32Array(n);
    for (let r = 0; r < this.rows; r++) {
      for (let k = 0; k < this.cols; k++) {
        const i = r * this.cols + k;
        this.rx[i] = this.px[i] = geom.x[i] + ox;
        this.ry[i] = this.py[i] = geom.y[i] + oy;
        this.row[i] = r;
        this.ww[i] = Math.pow(r / (this.rows - 1), 1.2);
        this.front[i] = geom.depth[i] >= 0 ? 1 : 0;
      }
    }
    const link = (a: number, b: number, hem = false) => {
      const d = (geom.depth[a] + geom.depth[b]) / 2;
      this.edges.push({
        a,
        b,
        front: hem ? this.front[a] === 1 : d >= 0,
        L: Math.hypot(this.rx[a] - this.rx[b], this.ry[a] - this.ry[b]) * 0.985,
        w: (this.row[a] + this.row[b]) / 2 / (this.rows - 1),
      });
    };
    const C = this.cols;
    for (let r = 0; r < this.rows - 1; r++) {
      for (let k = 0; k < C; k++) {
        const a = r * C + k;
        if (r % 2 === 0) {
          link(a, (r + 1) * C + k);
          link(a, (r + 1) * C + ((k + C - 1) % C));
        } else {
          link(a, (r + 1) * C + k);
          link(a, (r + 1) * C + ((k + 1) % C));
        }
      }
    }
    const last = (this.rows - 1) * C;
    for (let k = 0; k < C; k++) link(last + k, last + ((k + 1) % C), true);
  }

  impulse(dx: number, dy: number): void {
    for (let i = this.cols; i < this.n; i++) {
      const w = this.row[i] / (this.rows - 1);
      this.vx[i] += dx * w;
      this.vy[i] += dy * w;
    }
  }

  /** The ball hit the rim but not the net: the net still reacts, either swinging (A) or puffing up (C). */
  rimHit(dir: number, s: number): void {
    if (Math.random() < 0.5) {
      this.impulse(dir * 0.95 * s, 0.15 * s);
      return;
    }
    this.impulse(dir * 0.25 * s, -1.5 * s);
    const C = this.cols;
    let cx = 0;
    for (let i = 0; i < C; i++) cx += this.px[i];
    cx /= C;
    for (let i = C; i < this.n; i++) {
      const w = this.row[i] / (this.rows - 1);
      this.vx[i] += Math.sign(this.px[i] - cx) * 0.55 * s * w;
    }
  }

  setHoop(ms: number, offX: number, hoopAcc: number): void {
    const frames = ms / (1000 / 60);
    this.offX = offX;
    const sdt = frames / 2;
    for (let i = 0; i < 2; i++) {
      const a = -SWAY_K * this.sway - SWAY_C * this.swayV - (hoopAcc * SWAY_GAIN) / 2;
      this.swayV += a * sdt;
      this.sway += this.swayV * sdt;
    }
    this.sway = Math.max(-SWAY_MAX, Math.min(SWAY_MAX, this.sway));
  }

  step(dt: number, ball: NetBall | null): [number, number] {
    const P = NET_PARAMS;
    const C = this.cols;
    const n = this.n;
    let fbx = 0;
    let fby = 0;
    for (let i = C; i < n; i++) {
      this.ax[i] = (this.rx[i] - this.px[i]) * P.shape;
      this.ay[i] = P.grav + (this.ry[i] - this.py[i]) * P.shape;
    }
    for (const e of this.edges) {
      const a = e.a;
      const b = e.b;
      const dx = this.px[b] - this.px[a];
      const dy = this.py[b] - this.py[a];
      const d = Math.hypot(dx, dy) || 0.0001;
      const ux = dx / d;
      const uy = dy / d;
      const k = P.kTop + (P.kBot - P.kTop) * e.w;
      let f = d > e.L ? k * (d - e.L) : 0;
      const rv = (this.vx[b] - this.vx[a]) * ux + (this.vy[b] - this.vy[a]) * uy;
      f += P.edgeDamp * rv * (d > e.L * 0.98 ? 1 : 0.3);
      if (a >= C) {
        this.ax[a] += f * ux;
        this.ay[a] += f * uy;
      }
      if (b >= C) {
        this.ax[b] -= f * ux;
        this.ay[b] -= f * uy;
      }
    }
    if (ball) {
      for (let i = C; i < n; i++) {
        const sx = this.offX + this.sway * this.ww[i];
        const sy = -SWAY_LIFT * Math.abs(this.sway) * this.ww[i];
        const force = netBallForce({ x: this.px[i], y: this.py[i], vx: this.vx[i], vy: this.vy[i], offsetX: sx, offsetY: sy }, ball);
        this.ax[i] += force.nodeX;
        this.ay[i] += force.nodeY;
        fbx += force.ballX;
        fby += force.ballY;
      }
    }
    for (let i = C; i < n; i++) {
      this.vx[i] = (this.vx[i] + this.ax[i] * dt) * (1 - P.damp * dt);
      this.vy[i] = (this.vy[i] + this.ay[i] * dt) * (1 - P.damp * dt);
      const sp = Math.hypot(this.vx[i], this.vy[i]);
      if (sp > MAX_NODE_SPEED) {
        this.vx[i] *= MAX_NODE_SPEED / sp;
        this.vy[i] *= MAX_NODE_SPEED / sp;
      }
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
    }
    return [fbx, fby];
  }

  private line(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number): void {
    let ax = Math.round(x0);
    let ay = Math.round(y0);
    const bx = Math.round(x1);
    const by = Math.round(y1);
    const dx = Math.abs(bx - ax);
    const dy = -Math.abs(by - ay);
    const sx = ax < bx ? 1 : -1;
    const sy = ay < by ? 1 : -1;
    let e = dx + dy;
    for (;;) {
      ctx.fillRect(ax, ay, 1, 1);
      if (ax === bx && ay === by) break;
      const e2 = 2 * e;
      if (e2 >= dy) {
        e += dy;
        ax += sx;
      }
      if (e2 <= dx) {
        e += dx;
        ay += sy;
      }
    }
  }

  private wx(i: number): number {
    return this.px[i] + this.offX + this.sway * this.ww[i];
  }

  private wy(i: number): number {
    return this.py[i] - SWAY_LIFT * Math.abs(this.sway) * this.ww[i];
  }

  draw(ctx: CanvasRenderingContext2D, layer: "back" | "front"): void {
    const wantFront = layer === "front";
    const shadow = wantFront ? "#8a909c" : "#6f7682";
    const cord = wantFront ? "#ffffff" : "#c4c9d2";
    const list = this.edges.filter((e) => e.front === wantFront);
    ctx.fillStyle = shadow;
    for (const e of list) this.line(ctx, this.wx(e.a) + 1, this.wy(e.a), this.wx(e.b) + 1, this.wy(e.b));
    ctx.fillStyle = cord;
    for (const e of list) this.line(ctx, this.wx(e.a), this.wy(e.a), this.wx(e.b), this.wy(e.b));
    for (let i = this.cols; i < this.n; i++) {
      if ((this.front[i] === 1) !== wantFront) continue;
      const x = Math.round(this.wx(i));
      const y = Math.round(this.wy(i));
      ctx.fillStyle = shadow;
      ctx.fillRect(x, y, 2, 2);
      ctx.fillStyle = wantFront ? "#ffffff" : "#e4e8ee";
      ctx.fillRect(x - 1, y - 1, 2, 2);
    }
  }
}
