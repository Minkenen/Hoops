// The Park theme's sky: big clouds and bird pairs all the time, and now and then something crosses it: a V of birds, an airliner,
// a biplane with a banner and a flying hero in a white suit and a green cape. One thing at a time. Written in the mock-up's coordinates (y = local y + 174).

const GLYPHS: Record<string, string> = {
  H: "10001 10001 11111 10001 10001",
  O: "01110 10001 10001 10001 01110",
  P: "11110 10001 11110 10000 10000",
  S: "01111 10000 01110 00001 11110",
  L: "10000 10000 10000 10000 11111",
  A: "01110 10001 11111 10001 10001",
  Y: "10001 01010 00100 00100 00100",
  " ": "00000 00000 00000 00000 00000",
};

const OY = 174;
/** One round of the programme, in ms. Each thing crosses slowly (about 50 px/s) with a pause between them. */
const CYCLE = 70000;

let c: CanvasRenderingContext2D;

function hs(a: number, b: number): number {
  let n = (a * 374761393 + b * 668265263) | 0;
  n = (n ^ (n >>> 13)) * 1274126177;
  return (((n ^ (n >>> 16)) >>> 0) % 1000) / 1000;
}

function r(x: number, y: number, w: number, h: number, col: string): void {
  c.fillStyle = col;
  c.fillRect(Math.round(x), Math.round(y - OY), w, h);
}

function text(s: string, x: number, y: number, col: string): void {
  for (const ch of s) {
    const g = (GLYPHS[ch] ?? GLYPHS[" "]).split(" ");
    for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) if (g[j][i] === "1") r(x + i, y + j, 1, 1, col);
    x += 6;
  }
}

function cloud(cx: number, cy: number, sc: number, col: string, shade: string): void {
  for (const [dx, dy, w] of [[0, 0, 20], [-6, 3, 14], [6, 3, 16], [0, 5, 26]]) r(cx + dx * sc, cy + dy * sc, w * sc, 3 * sc, col);
  r(cx - 13 * sc, cy + 8 * sc, 26 * sc, sc, shade);
}

function clouds(t: number, w: number, n: number, sc: number, speed: number, y0: number, y1: number, col: string, shade: string, seed: number): void {
  const span = w + 80 * sc;
  for (let i = 0; i < n; i++) {
    const x = ((((hs(i, seed) * span - (t * speed) / 1000) % span) + span) % span) - 40 * sc;
    cloud(Math.round(x), Math.round(y0 + hs(i, seed + 7) * (y1 - y0)), sc, col, shade);
  }
}

function bird(x: number, y: number, t: number, k: number): void {
  const up = Math.floor(t / 150 + k) % 2;
  const pts = up ? [[-3, -2], [-2, -1], [-1, 0], [0, 0], [1, 0], [2, -1], [3, -2]] : [[-3, 1], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [3, 1]];
  for (const [a, b] of pts) r(x + a, y + b, 1, 1, "#2a3a5a");
}

function airliner(x: number, y: number): void {
  r(x - 12, y + 2, 24, 5, "#f4f6fb");
  r(x - 12, y + 2, 24, 1, "#fff");
  r(x + 8, y, 6, 3, "#f4f6fb");
  r(x + 10, y - 1, 3, 2, "#e8392b");
  r(x - 14, y + 3, 3, 3, "#f4f6fb");
  r(x - 16, y, 4, 4, "#e8392b");
  r(x - 4, y + 6, 10, 2, "#aeb4c4");
  r(x - 6, y - 1, 8, 3, "#aeb4c4");
  for (let i = 0; i < 7; i++) r(x - 9 + i * 3, y + 3, 1, 1, "#4a5a7a");
  r(x + 11, y + 3, 3, 2, "#4a5a7a");
}

function contrail(x: number, y: number, len: number, t: number): void {
  for (let i = 0; i < len; i += 2) {
    c.globalAlpha = 0.55 * (1 - i / len);
    r(x - (14 + i), y + 4 + Math.sin(i / 9 + t / 900) * 0.6, 2, 2, "#ffffff");
  }
  c.globalAlpha = 1;
}

function biplane(x: number, y: number, t: number): void {
  r(x - 9, y, 18, 4, "#e8392b");
  r(x - 9, y, 18, 1, "#ff6a5a");
  r(x + 7, y - 3, 6, 4, "#e8392b");
  r(x - 14, y + 1, 5, 2, "#e8392b");
  r(x - 6, y - 5, 14, 2, "#f4f6fb");
  r(x - 6, y + 4, 14, 2, "#f4f6fb");
  r(x - 6, y - 3, 1, 7, "#aeb4c4");
  r(x + 5, y - 3, 1, 7, "#aeb4c4");
  r(x + 13, y - 1, 1, 5, Math.floor(t / 60) % 2 ? "#444444" : "#bbbbbb");
  r(x + 16, y + 3, 31, 1, "#444444");
  r(x + 48, y - 8, 74, 18, "#ffffff");
  r(x + 48, y - 8, 74, 2, "#e8731f");
  r(x + 48, y + 8, 74, 2, "#e8731f");
  text("HOOPERLY", x + 71 - 24, y - 4, "#1c1c22");
}

/** Verde: a white suit with green trim and a green cape, a green basketball on the chest. Flies to the right. */
/** How many times bigger the flying hero is drawn (a whole number, so the pixels stay square). */
const HERO_SCALE = 2;

function hero(x: number, y: number, t: number, wave: boolean): void {
  c.save();
  c.translate(Math.round(x), Math.round(y - OY));
  c.scale(HERO_SCALE, HERO_SCALE);
  heroBody(0, OY, t, wave);
  c.restore();
}

function heroBody(x: number, y: number, t: number, wave: boolean): void {
  const suit = "#f2f4f7";
  const trim = "#2fa84f";
  const cape = "#1f8a3c";
  // the cape is a chain fixed at the shoulders: each part bends a little more than the one before it, so it hardly moves at the neck and waves most at the free end
  let px = x + 4;
  let py = y - 3;
  let th = -0.3;
  const N = 21;
  for (let i = 0; i < N; i++) {
    th += Math.sin(t / 190 - i * 0.5) * 0.09 * (i / 4) + 0.02;
    px -= Math.cos(th);
    py += Math.sin(th) * 0.9;
    const frayed = i >= N - 6 && i % 2 === 0;
    const h = Math.max(2, 9 - Math.floor(i * 0.35) - (frayed ? 3 : 0));
    const top = Math.round(py) - 1 + (frayed ? 1 : 0);
    r(Math.round(px) - 1, top, 2, h, cape);
    r(Math.round(px) - 1, top, 2, 1, "#5fd878");
    if (i % 4 === 3) r(Math.round(px) - 1, top + h - 1, 2, 1, "#8aeea0");
  }
  r(x + 1, y - 4, 4, 7, cape);
  r(x + 1, y - 4, 4, 1, "#5fd878");
  // legs trailing behind, boots
  r(x - 10, y + 1, 6, 2, suit);
  r(x - 10, y + 3, 6, 2, "#d8dde6");
  r(x - 13, y + 1, 3, 2, trim);
  r(x - 13, y + 3, 3, 2, trim);
  // torso and belt
  r(x - 5, y - 1, 10, 5, suit);
  r(x - 5, y - 1, 10, 1, "#ffffff");
  r(x - 5, y - 1, 2, 5, trim);
  // the arm: reaching forward, or up while he waves
  if (wave) {
    r(x + 5, y - 6, 2, 6, suit);
    r(x + 5, y - 8, 3, 2, trim);
  } else {
    r(x + 4, y, 6, 2, suit);
    r(x + 9, y - 1, 3, 3, trim);
  }
  // head: brown hair and a green mask
  r(x + 5, y - 4, 6, 6, "#f2c9a0");
  r(x + 5, y - 5, 6, 2, "#6a4a2a");
  r(x + 4, y - 4, 2, 3, "#6a4a2a");
  r(x + 9, y - 2, 2, 1, "#1c1c22");
  r(x + 7, y - 4, 5, 1, trim);
  // a green basketball on the chest
  r(x - 2, y, 4, 3, trim);
  r(x - 1, y, 1, 3, "#0e4a1e");
  r(x - 2, y + 1, 4, 1, "#0e4a1e");
}

// ---- shooting the hero down

interface FallingHero {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ang: number;
}
interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  g?: number;
  col?: string;
  sz?: number;
  fire?: boolean;
  cape?: boolean;
  drag?: number;
}
interface Puff {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  s: number;
}

const GRASS = 250; // the grass line in the mock-up's coordinates
let flying: { x: number; y: number } | null = null;
let disabledCycle = -1;
let fall: FallingHero | null = null;
let crashed = false;
let crashAt = 0;
let crashX = 0;
let bits: Bit[] = [];
let smokes: Puff[] = [];
let flames: Puff[] = [];
let lastT = 0;
let heroCv: HTMLCanvasElement | null = null;
const rnd = (a: number, b: number): number => a + Math.random() * (b - a);

/** Is anything from a downed hero still going on (so the game keeps drawing)? */
export function skyBusy(): boolean {
  return !!fall || bits.length > 0 || smokes.length > 0 || flames.length > 0;
}

/**
 * Tests a ball (in the park's local coordinates) against the flying hero. On a hit he starts to fall and returns true.
 */
export function heroHit(ballX: number, ballY: number, rad: number): boolean {
  if (!flying || fall) return false;
  if (Math.hypot(ballX - flying.x, ballY - (flying.y - OY)) > rad + 14 * HERO_SCALE) return false;
  fall = { x: flying.x, y: flying.y, vx: 30, vy: -60, ang: 0 };
  crashed = false;
  disabledCycle = Math.floor(lastT / CYCLE);
  flying = null;
  return true;
}

function fireball(cx: number, cy: number, rad: number, seed: number, u: number): void {
  const N = 22;
  const span = Math.ceil(rad * 1.5);
  for (let dy = -span; dy <= span; dy++) {
    for (let dx = -span; dx <= span; dx++) {
      const d = Math.hypot(dx, dy);
      if (d > rad * 1.3) continue;
      const bin = Math.floor(((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI)) * N);
      const nr = rad * (0.72 + 0.5 * hs(bin, seed));
      if (d > nr) continue;
      const k = d / nr + u * 0.55;
      r(cx + dx, cy + dy, 1, 1, k < 0.22 ? "#fff6c0" : k < 0.5 ? "#ffd24a" : k < 0.78 ? "#ff9a2a" : k < 1 ? "#e8392b" : "#a8281a");
    }
  }
}

/** The hero spinning on his way down: drawn small into its own canvas, then turned in 15 degree steps. */
function drawFalling(f: FallingHero, t: number): void {
  heroCv ??= document.createElement("canvas");
  heroCv.width = 64 * HERO_SCALE;
  heroCv.height = 48 * HERO_SCALE;
  const main = c;
  c = heroCv.getContext("2d")!;
  c.clearRect(0, 0, 64 * HERO_SCALE, 48 * HERO_SCALE);
  hero(36 * HERO_SCALE, 24 * HERO_SCALE + OY, t, false);
  c = main;
  c.save();
  c.imageSmoothingEnabled = false;
  c.translate(Math.round(f.x), Math.round(f.y - OY));
  c.rotate(Math.round(f.ang / 0.2618) * 0.2618);
  c.drawImage(heroCv, -36 * HERO_SCALE, -24 * HERO_SCALE);
  c.restore();
}

/** Moves and draws everything from a shot-down hero: the fall, the crash, the explosion, smoke and bits. */
function downedHero(t: number, dt: number): void {
  const f = fall;
  if (f && !crashed) {
    f.vy += 300 * dt;
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    f.ang += dt * 9;
    smokes.push({ x: f.x, y: f.y, vx: rnd(-20, 5), vy: rnd(-10, 10), age: 0, life: rnd(0.8, 1.5), s: rnd(5, 9) });
    if (Math.random() < 0.8) flames.push({ x: f.x + rnd(-4, 4), y: f.y + rnd(-4, 4), vx: rnd(-10, 10), vy: -rnd(5, 25), age: 0, life: rnd(0.2, 0.4), s: rnd(3, 6) });
    if (f.y > GRASS - 4) {
      crashed = true;
      crashAt = t;
      crashX = f.x;
      for (let i = 0; i < 26; i++) {
        const a = rnd(-3.1, 0);
        const sp = rnd(60, 200);
        bits.push({ x: f.x, y: GRASS - 4, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, age: 0, life: rnd(0.6, 1.3), col: ["#f2f4f7", "#2fa84f", "#f2c9a0", "#6a4a2a", "#1c1c22"][i % 5], sz: i % 4 === 0 ? 4 : 2, fire: i % 3 === 0 });
      }
      for (let i = 0; i < 22; i++) smokes.push({ x: f.x + rnd(-14, 14), y: GRASS - 6, vx: rnd(-10, 10), vy: -rnd(18, 50), age: 0, life: rnd(2, 4), s: rnd(8, 16) });
      bits.push({ x: f.x - 6, y: GRASS - 40, vx: rnd(-20, 20), vy: -20, age: 0, life: 4, g: -40, cape: true, drag: 1.2 });
      fall = null;
    }
  }
  if (f && !crashed) drawFalling(f, t);
  if (crashed) {
    const m = (t - crashAt) / 1000;
    if (m < 1.2) {
      fireball(Math.round(crashX), GRASS - 10 - Math.round(Math.min(1, m * 2) * 14), Math.round(Math.min(1, m * 2.5) * (m > 0.7 ? Math.max(0.2, 1 - (m - 0.7) * 2) : 1) * 44), 9, Math.min(1, m));
      c.globalAlpha = Math.max(0, 1 - m);
      c.strokeStyle = "#fff6c0";
      c.lineWidth = 2;
      c.beginPath();
      c.ellipse(crashX, GRASS - 2 - OY, 12 + m * 120, 2 + m * 14, 0, 0, 6.283);
      c.stroke();
      c.globalAlpha = 1;
    }
    if (m > 6.5) crashed = false;
  }
  for (const p of bits) {
    p.age += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += (p.g ?? 260) * dt;
    p.vx *= 1 - (p.drag ?? 0) * dt;
    if (p.fire && Math.random() < 0.5) flames.push({ x: p.x, y: p.y, vx: rnd(-8, 8), vy: -rnd(10, 30), age: 0, life: rnd(0.2, 0.4), s: rnd(3, 5) });
  }
  bits = bits.filter((p) => p.age < p.life);
  for (const p of smokes) {
    p.age += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const u = p.age / p.life;
    const s = p.s + u * 14;
    c.globalAlpha = 0.55 * (1 - u);
    r(p.x - s / 2, p.y - s / 2, s, s * 0.8, "#4a4a56");
    c.globalAlpha = 1;
  }
  smokes = smokes.filter((p) => p.age < p.life);
  for (const p of flames) {
    p.age += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const u = p.age / p.life;
    const s = Math.max(1, p.s * (1 - u));
    r(p.x - s / 2, p.y - s / 2, s, s, u < 0.3 ? "#fff6c0" : u < 0.6 ? "#ffd24a" : "#ff8a1f");
  }
  flames = flames.filter((p) => p.age < p.life);
  for (const p of bits) {
    if (p.cape) {
      const k = Math.sin(p.age * 3) * 4;
      r(p.x + k, p.y, 10, 3, "#1f8a3c");
      r(p.x + k - 2, p.y + 3, 12, 3, "#14672b");
      r(p.x + k + 1, p.y + 6, 8, 2, "#1f8a3c");
    } else r(p.x, p.y, p.sz ?? 2, p.sz ?? 2, p.col ?? "#fff");
  }
}

/** topY = the top of the sky, in the park's local coordinates. Sky things are clipped to the sky. */
export function drawParkSky(ctx: CanvasRenderingContext2D, t: number, w: number, topY: number): void {
  c = ctx;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, topY, w, 76 - topY);
  ctx.clip();
  const k = Math.max(1, w / 500);
  clouds(t, w, Math.round(6 * k), 3, 6, 18, 170, "#ffffff", "#d9e8f7", 5);
  clouds(t, w, Math.round(3 * k), 1, 1.2, 20, 120, "#eaf5ff", "#cfe3f7", 6);
  for (let i = 0; i < Math.round(4 * k); i++) {
    const x = ((((t / 60) * (i % 2 ? 1 : -1) + hs(i, 12) * w) % w) + w) % w;
    const y = 36 + i * 34 + Math.sin(t / 600 + i) * 3;
    bird(Math.round(x), Math.round(y), t, i);
    bird(Math.round(x) + 9, Math.round(y) + 5, t, i + 1);
  }
  // The programme, one thing at a time.
  const T = t % CYCLE;
  if (T < 14000) {
    const x = -50 + (T / 14000) * (w + 120);
    for (let i = 0; i < 7; i++) {
      const row = Math.ceil(i / 2);
      const side = i % 2 ? 1 : -1;
      bird(Math.round(x - row * 10), Math.round(90 + (i ? side * row * 5 : 0) + Math.sin(t / 700 + i) * 1.5), t, i);
    }
  } else if (T > 16000 && T < 34000) {
    const x = -30 + ((T - 16000) / 18000) * (w + 60);
    contrail(x, 50, 170, t);
    airliner(x, 50);
  } else if (T > 36000 && T < 54000) {
    biplane(w + 90 - ((T - 36000) / 18000) * (w + 240), 80, t);
  } else if (T >= 56000 && T < 67000 && Math.floor(t / CYCLE) !== disabledCycle) {
    const u = (T - 56000) / 11000;
    const hx = -40 + u * (w + 80);
    const hy = 70 + Math.sin(u * Math.PI * 1.4) * 28 - u * 10 + 24;
    flying = { x: hx, y: hy };
    hero(hx, hy, t, u > 0.35 && u < 0.7);
  } else flying = null;
  const dt = Math.min(0.05, Math.max(0, (t - lastT) / 1000));
  lastT = t;
  downedHero(t, dt);
  ctx.restore();
}
