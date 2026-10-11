// The train themes: the backdrop behind a court on a train roof. Three scenes (countryside, night city, desert canyon) scroll past in layers.
// The scenery is written in the mock-up's coordinates (the roof's far edge at y = 236); drawTrain() places it in the game (that edge at y = 76).

export type TrainScene = "day" | "night" | "canyon";

const ROOF_BACK = 236;
const OFFSET = 160; // mock-up y minus game y
const DK = "#1c1c22";

let c: CanvasRenderingContext2D;
let W = 500;

function hs(a: number, b: number): number {
  let n = (a * 374761393 + b * 668265263) | 0;
  n = (n ^ (n >>> 13)) * 1274126177;
  return (((n ^ (n >>> 16)) >>> 0) % 1000) / 1000;
}

const mod = (a: number, b: number): number => ((a % b) + b) % b;

function r(x: number, y: number, w: number, h: number, col: string): void {
  c.fillStyle = col;
  c.fillRect(Math.round(x), Math.round(y), w, h);
}

function disc(cx: number, cy: number, R: number, col: string, edge?: string): void {
  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      const d = dx * dx + dy * dy;
      if (d <= R * R + 1) r(cx + dx, cy + dy, 1, 1, edge && d > (R - 1) * (R - 1) + 1 ? edge : col);
    }
  }
}

function line(x1: number, y1: number, x2: number, y2: number, col: string, th = 1): void {
  const n = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) || 1;
  for (let i = 0; i <= n; i++) r(x1 + ((x2 - x1) * i) / n, y1 + ((y2 - y1) * i) / n, th, th, col);
}

function bands(cols: string[], y0: number, y1: number): void {
  const h = (y1 - y0) / cols.length;
  cols.forEach((col, i) => r(0, Math.round(y0 + i * h), W, Math.ceil(h) + 1, col));
}

function hills(t: number, speed: number, base: number, amp: number, f1: number, f2: number, col: string, top: string | null, seed: number): void {
  const off = (t * speed) / 1000;
  for (let x = 0; x < W; x++) {
    const w = x + off;
    const h = Math.round(base - (Math.sin(w * f1 + seed) + Math.sin(w * f2 + seed * 2) * 0.5) * amp);
    r(x, h, 1, ROOF_BACK - h, col);
    if (top) r(x, h, 1, 1, top);
  }
}

function cloud(cx: number, cy: number, sc: number, col: string, shade: string): void {
  for (const [dx, dy, w] of [[0, 0, 20], [-6, 3, 14], [6, 3, 16], [0, 5, 26]]) r(cx + dx * sc, cy + dy * sc, w * sc, 3 * sc, col);
  r(cx - 13 * sc, cy + 8 * sc, 26 * sc, sc, shade);
}

function clouds(t: number, n: number, sc: number, speed: number, y0: number, y1: number, col: string, shade: string, seed: number): void {
  const span = W + 80 * sc;
  for (let i = 0; i < n; i++) cloud(Math.round(mod(hs(i, seed) * span - (t * speed) / 1000, span) - 40 * sc), Math.round(y0 + hs(i, seed + 7) * (y1 - y0)), sc, col, shade);
}

/** Calls draw for objects placed along the scrolling world every gap pixels. */
function along(t: number, speed: number, gap: number, draw: (x: number, k: number) => void): void {
  const off = (t * speed) / 1000;
  const k0 = Math.floor(off / gap) - 1;
  for (let k = k0; k < k0 + Math.ceil(W / gap) + 3; k++) draw(Math.round(k * gap - off + hs(k, 5) * gap * 0.5), k);
}

function pole(x: number, top: number, base: number, col: string): void {
  r(x, top, 3, base - top, col);
  r(x - 7, top + 4, 17, 2, col);
  r(x - 5, top + 9, 13, 2, col);
}

function wires(t: number, speed: number, gap: number, top: number, sag: number, col: string): void {
  const off = (t * speed) / 1000;
  const k0 = Math.floor(off / gap) - 1;
  for (let k = k0; k < k0 + Math.ceil(W / gap) + 3; k++) {
    const x1 = k * gap - off;
    for (let u = 0; u <= gap; u += 2) {
      const y = top + Math.sin((u / gap) * Math.PI) * sag;
      r(x1 + u, y, 2, 1, col);
      r(x1 + u, y + 5, 2, 1, col);
    }
  }
}

function tree(x: number, y: number, s: number, dark: string, light: string): void {
  r(x, y - s, 2, s, "#4a2f1a");
  disc(x + 1, y - s - (5 * s) / 6, Math.round(5 + s / 3), dark, DK);
  r(x - 2, y - s - (5 * s) / 6 - 2, 3, 2, light);
}

function stars(t: number, n: number, seed: number, max: number): void {
  for (let i = 0; i < n; i++) if (Math.floor(t / 400 + i * 3) % 7 !== 0) r(hs(i, seed) * W, hs(i, seed + 3) * max, 1, 1, i % 5 ? "#ffffff" : "#bfe6ff");
}

function wind(t: number, n: number, col: string, speed: number): void {
  for (let i = 0; i < n; i++) {
    const y = 60 + hs(i, 1) * 170;
    const len = 14 + hs(i, 2) * 30;
    c.globalAlpha = 0.35;
    r(mod(hs(i, 3) * W * 2 - (t * speed * (0.6 + hs(i, 4) * 0.8)) / 1000, W + 80) - 40, y, len, 1, col);
    c.globalAlpha = 1;
  }
}

function smoke(t: number, n: number, col: string): void {
  for (let i = 0; i < n; i++) {
    const life = (t / 1000) * 0.45 + i / n;
    const f = life - Math.floor(life);
    const x = W + 10 - f * (W + 80);
    const y = ROOF_BACK - 26 - f * 40 - Math.sin(i * 3 + f * 5) * 8;
    const s = 6 + f * 20;
    c.globalAlpha = 0.75 * (1 - f * 0.9);
    r(x - s / 2, y - s / 2, s, s * 0.8, col);
    r(x - s / 2 + 2, y - s / 2 - 2, s * 0.6, 3, "#ffffff66");
    c.globalAlpha = 1;
  }
}

/** A train coming the other way on the next track. */
function meetTrain(t: number, kind: "pass" | "lit", start: number, dur: number, period = 22000): void {
  const T = t % period;
  if (T < start || T > start + dur) return;
  const L = 1300;
  const xr = Math.round(W + 40 - ((T - start) / dur) * (W + L));
  if (kind === "pass") {
    for (let i = 0; i * 130 < L; i++) {
      const cx = xr + i * 130;
      if (cx > W + 10 || cx + 126 < -10) continue;
      const red = i % 2 === 0;
      r(cx, 152, 126, 84, red ? "#d9342b" : "#eef1f6");
      r(cx, 152, 126, 3, red ? "#ff6a5a" : "#ffffff");
      r(cx, 196, 126, 5, red ? "#f4f6fb" : "#d9342b");
      r(cx, 228, 126, 8, "#2a2a32");
      for (let wx = cx + 8; wx < cx + 118; wx += 26) {
        r(wx, 164, 20, 24, "#243a5e");
        r(wx, 164, 20, 3, "#6a8ac0");
        r(wx + 2, 168, 6, 10, "#7f9fd6");
      }
      r(cx + 120, 152, 6, 84, DK);
    }
  } else {
    r(xr, 150, L, 86, "#171a28");
    for (let i = 0; i * 34 < L - 20; i++) {
      const wx = xr + 10 + i * 34;
      if (wx > -40 && wx < W + 40) {
        r(wx, 164, 26, 28, "#ffe9a0");
        r(wx, 164, 26, 3, "#fff6c8");
        r(wx + 12, 164, 2, 28, "#171a28");
      }
    }
    r(xr, 196, L, 3, "#e8392b");
  }
}

// ---- the bullet train with the kung fu fight (countryside)

const ROOF_Y = 150; // the other train's roof line
const ease = (u: number): number => (u < 0 ? 0 : u > 1 ? 1 : u * u * (3 - 2 * u));

interface Pose {
  lean?: number;
  armL?: number;
  armR?: number;
  kick?: number;
  crouch?: number;
}
interface Pal {
  legs: string;
  top: string;
  hi: string;
  shoe: string;
  band: string;
}

function fighter(x: number, y: number, face: number, p: Pose, pal: Pal): void {
  const L = (a: number, b: number, w: number, h: number, col: string): void => r(face > 0 ? x + a : x - a - w, y + b, w, h, col);
  const lean = Math.round(p.lean ?? 0);
  const cr = Math.round((p.crouch ?? 0) * 3);
  const kick = p.kick ?? 0;
  if (kick > 0) {
    L(-1, -9 + cr, 3, 6, pal.legs);
    L(0, -4, 12 * kick + 2, 3, pal.legs);
    L(12 * kick + 1, -5, 3, 4, pal.shoe);
    L(-3, -3, 3, 3, pal.legs);
    L(-5, -1, 3, 1, pal.shoe);
  } else {
    L(-3, -8 + cr, 3, 8 - cr, pal.legs);
    L(1, -8 + cr, 3, 8 - cr, pal.legs);
    L(-4, -1, 4, 1, pal.shoe);
    L(1, -1, 4, 1, pal.shoe);
  }
  L(-3 + lean, -17 + cr, 7, 9, pal.top);
  L(-3 + lean, -17 + cr, 7, 1, pal.hi);
  L(-2 + lean, -23 + cr, 5, 5, "#f2c9a0");
  L(1 + lean, -21 + cr, 1, 1, DK);
  L(-2 + lean, -24 + cr, 5, 2, pal.band);
  L(-3 + lean, -23 + cr, 1, 2, pal.band);
  const ar = p.armR ?? 0;
  const ext = Math.round(ar * 9);
  L(3 + lean, -15 + cr - (ar > 0.5 ? 1 : 0), 3 + ext, 3, pal.top);
  L(5 + lean + ext, -16 + cr - (ar > 0.5 ? 1 : 0), 3, 4, "#f2c9a0");
  const al = p.armL ?? 0;
  if (al > 0) {
    const e = Math.round(al * 8);
    L(2 + lean, -13 + cr, 2 + e, 3, pal.hi);
    L(3 + lean + e, -14 + cr, 3, 4, "#f2c9a0");
  } else L(-3 + lean, -14 + cr, 3, 6, pal.hi);
}

function burst(x: number, y: number, t: number, col: string): void {
  const k = Math.floor(t / 60) % 4;
  for (let i = 0; i < 8; i++) {
    const a = i * 0.785 + k * 0.2;
    const d = 3 + k * 2;
    r(x + Math.cos(a) * d, y + Math.sin(a) * d, 2, 2, col);
  }
  r(x - 1, y - 1, 3, 3, "#fff");
}

const SIGN: Record<string, string> = {
  P: "11110 10001 11110 10000 10000",
  O: "01110 10001 10001 10001 01110",
  W: "10001 10001 10101 11011 10001",
  H: "10001 10001 11111 10001 10001",
  A: "01110 10001 11111 10001 10001",
  M: "10001 11011 10101 10001 10001",
};

function sign(s: string, x: number, y: number): void {
  for (const [dx, col] of [[1, DK], [0, "#ffe14a"]] as const) {
    let px = x;
    for (const ch of s) {
      const g = SIGN[ch].split(" ");
      for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) if (g[j][i] === "1") r(px + i * 2 + dx, y + j * 2 + dx, 2, 2, col);
      px += 12;
    }
  }
}

const WHITE: Pal = { legs: "#e8edf5", top: "#f4f6fb", hi: "#cfd6e4", shoe: "#aeb4c4", band: "#e8392b" };
const BLACK: Pal = { legs: "#1c1c24", top: "#25252f", hi: "#3a3a48", shoe: "#0c0c10", band: "#f4f6fb" };

/** Two fighters on the roof: flying kicks with speed lines and POW / WHAM signs. */
function fight(t: number, cx: number): void {
  const T = (t % 2800) / 2800;
  const sw = Math.sin(t / 110);
  let pA: Pose = {};
  let pB: Pose = {};
  let xA = cx - 14;
  let xB = cx + 14;
  let fx: [number, number] | null = null;
  if (T < 0.2) {
    pA = { armR: Math.abs(sw) * 0.5 };
    pB = { armR: Math.abs(sw) * 0.5, crouch: 0.2 };
  } else if (T < 0.45) {
    const u = (T - 0.2) / 0.25;
    pA = { kick: Math.sin(u * Math.PI), lean: -2 };
    xA += Math.round(u * 14);
    pB = { crouch: 0.8, lean: -2 };
    if (u > 0.35 && u < 0.65) fx = [xA + 16, ROOF_Y - 10];
  } else if (T < 0.7) {
    const u = (T - 0.45) / 0.25;
    pB = { kick: Math.sin(u * Math.PI), lean: -2 };
    xB -= Math.round(u * 14);
    pA = { crouch: 0.8, lean: -2 };
    if (u > 0.35 && u < 0.65) fx = [xB - 16, ROOF_Y - 10];
  } else {
    pA = { armR: 1, lean: 2 };
    pB = { armR: 1, lean: 2 };
    if (T > 0.8 && T < 0.9) fx = [cx, ROOF_Y - 20];
  }
  fighter(xA, ROOF_Y, 1, pA, WHITE);
  fighter(xB, ROOF_Y, -1, pB, BLACK);
  if (fx) {
    burst(fx[0], fx[1], t, "#7fe0ff");
    if (Math.floor(t / 90) % 2) sign(T < 0.55 ? "POW" : "WHAM", fx[0] - 10, fx[1] - 18);
    for (let k = 0; k < 4; k++) {
      c.globalAlpha = 0.6;
      r(cx - 36 - k * 6, ROOF_Y - 22 + k * 3, 14, 1, "#fff");
      c.globalAlpha = 1;
    }
  }
}

const LOCO_LEN = 190;
const CAR_W = 144;
const CAR_GAP = 6;

/** The nose of the train over a 40 s round: in from the left, slowing, alongside for a long while, then off to the right. */
function nosePos(t: number): number | null {
  const T = (t - 3000) % 40000;
  if (T < 0 || T > 28000) return null;
  if (T < 6000) return -40 + ease(T / 6000) * 730;
  if (T < 22000) return 690 + ((T - 6000) / 16000) * 60;
  return 750 + Math.pow((T - 22000) / 6000, 2.2) * 1500;
}

function carriage(x0: number): void {
  r(x0, ROOF_Y, CAR_W, 86, "#d6dde8");
  r(x0, ROOF_Y, CAR_W, 4, "#f4f8fc");
  r(x0, ROOF_Y - 4, CAR_W, 4, "#aeb8c8");
  r(x0 + 2, ROOF_Y - 6, CAR_W - 4, 2, "#c9d2e0");
  r(x0, 198, CAR_W, 6, "#2a5fd0");
  r(x0, 204, CAR_W, 2, "#7fb0f0");
  r(x0, 228, CAR_W, 8, "#4a5262");
  for (let wx = x0 + 10; wx < x0 + CAR_W - 10; wx += 22) {
    r(wx, 166, 16, 18, "#1a2744");
    r(wx, 166, 16, 3, "#6a8ac0");
  }
  r(x0 + CAR_W - 4, ROOF_Y - 6, 4, 92, "#8a94a8");
}

/** The locomotive: a long pointed nose, a headlight, and the driver in a cap behind the windscreen. */
function locomotive(nx: number): void {
  const x0 = nx - LOCO_LEN;
  const topAt = (u: number): number => ROOF_Y + Math.round(Math.pow(Math.max(0, u - (LOCO_LEN - 110)) / 110, 1.6) * 52);
  for (let u = 0; u <= LOCO_LEN; u++) {
    const top = topAt(u);
    r(x0 + u, top, 1, 236 - top, "#d6dde8");
    r(x0 + u, top, 1, 2, "#f4f8fc");
  }
  r(x0, 198, LOCO_LEN - 20, 6, "#2a5fd0");
  r(x0, 204, LOCO_LEN - 20, 2, "#7fb0f0");
  r(x0, 228, LOCO_LEN, 8, "#4a5262");
  for (let u = LOCO_LEN - 96; u < LOCO_LEN - 26; u++) {
    const top = topAt(u) + 4;
    r(x0 + u, top, 1, 14, "#1a2744");
    r(x0 + u, top, 1, 2, "#6a8ac0");
  }
  // the driver
  const dx = x0 + LOCO_LEN - 70;
  const dy = ROOF_Y + 10;
  r(dx, dy, 6, 6, "#f2c9a0");
  r(dx + 4, dy + 2, 1, 1, DK);
  r(dx - 1, dy - 2, 8, 3, "#1c2a5a");
  r(dx + 5, dy - 1, 3, 2, "#1c2a5a");
  r(dx - 1, dy + 6, 8, 6, "#2a3a6a");
  for (let wx = x0 + 10; wx < x0 + LOCO_LEN - 120; wx += 22) {
    r(wx, 166, 16, 18, "#1a2744");
    r(wx, 166, 16, 3, "#6a8ac0");
  }
  r(nx - 8, 196, 8, 12, DK);
  r(nx - 6, 200, 5, 4, "#fffbd0");
  c.globalAlpha = 0.35;
  r(nx - 14, 196, 16, 12, "#fff6b0");
  c.globalAlpha = 1;
  r(x0 + 8, ROOF_Y - 6, LOCO_LEN - 100, 4, "#aeb8c8");
}

/** The whole train: the nose leads, the carriages follow, and the fight is on the second carriage. */
function bulletTrain(t: number): void {
  const nx = nosePos(t);
  if (nx === null) return;
  for (let k = 4; k >= 1; k--) {
    const right = nx - LOCO_LEN - CAR_GAP - (k - 1) * (CAR_W + CAR_GAP);
    const x0 = Math.round(right - CAR_W);
    if (x0 <= W + 10 && x0 + CAR_W >= -10) carriage(x0);
  }
  locomotive(Math.round(nx));
  fight(t, Math.round(nx - LOCO_LEN - CAR_GAP - (CAR_W + CAR_GAP) - CAR_W / 2));
}

// ---- night city: a deep skyline in layers, a Bat-signal on one tower and Batman on another

/**
 * The night city round. The two landmark towers must slide in from beyond the right edge and out past the left edge
 * before the round starts over, or they would pop in and out. So the length of the round, and when the signal and
 * Batman come on, depend on how wide the picture is.
 */
interface Round {
  cyc: number;
  sigMid: number;
  batStart: number;
  batMid: number;
}
let TL: Round = { cyc: 56000, sigMid: 16, batStart: 23.5, batMid: 29.5 };

function roundFor(w: number): Round {
  const need = w + 120; // a tower has to cross the picture and its own width plus some
  const lead = 0.3 * w + 20; // how far it still has to go from the right edge to the spot where the signal shows
  const sigMid = Math.max(16, lead / 12 + 2);
  const batStart = sigMid + 7.5;
  const batMid = Math.max(batStart + 6, lead / 24 + 2);
  const cyc = Math.max(sigMid - lead / 12 + need / 12 + 2, batMid - lead / 24 + need / 24 + 2, batStart + 14);
  return { cyc: cyc * 1000, sigMid, batStart, batMid };
}
const WD = -1; // the wind blows to the left, the way the train is going

interface Layer {
  v: number;
  hm: number;
  base: number;
  col: string;
  win: string;
  dens: number;
}

const LAYERS: Layer[] = [
  { v: 6, hm: 0.5, base: 226, col: "#16224a", win: "#2a3a6a", dens: 0.7 },
  { v: 12, hm: 0.7, base: 232, col: "#111b3c", win: "#3a4f8a", dens: 0.6 },
  { v: 24, hm: 0.9, base: 240, col: "#0d1432", win: "#8a7a50", dens: 0.55 },
  { v: 48, hm: 1.15, base: 250, col: "#0b1128", win: "#ffd36a", dens: 0.45 },
];

function mkLayer(seed: number, wmin: number, wmax: number, hmin: number, hmax: number): { a: { x: number; w: number; h: number }[]; len: number } {
  const a: { x: number; w: number; h: number }[] = [];
  let x = 0;
  for (let k = 0; k < 90; k++) {
    const w = wmin + Math.floor(hs(k, seed) * (wmax - wmin));
    a.push({ x, w, h: hmin + Math.floor(hs(k, seed + 5) * (hmax - hmin)) });
    x += w + Math.floor(hs(k, seed + 9) * 5);
  }
  return { a, len: x };
}

const LAY = [mkLayer(11, 14, 26, 30, 80), mkLayer(21, 16, 30, 40, 100), mkLayer(31, 16, 34, 50, 120), mkLayer(41, 18, 40, 60, 130)];

function drawLayer(t: number, L: (typeof LAY)[number], cfg: Layer, antennas = false): void {
  const off = (t * cfg.v) / 1000;
  for (const b of L.a) {
    for (const rep of [-1, 0, 1, 2]) {
      const x = Math.round(b.x + rep * L.len - mod(off, L.len));
      if (x > W || x + b.w < 0) continue;
      const h = b.h * cfg.hm;
      r(x, cfg.base - h, b.w, h, cfg.col);
      if (antennas && hs(b.x + 3, b.w) > 0.62) {
        // a mast standing on the roof, with a red light on top
        const ah = 8 + Math.floor(hs(b.x, 91) * 14);
        const ax = x + Math.floor(b.w / 2);
        const top = cfg.base - h;
        r(ax, top - ah, 2, ah, "#1b2447");
        r(ax - 2, top - ah + 3, 6, 1, "#1b2447");
        if (Math.floor(t / (700 + hs(b.x, 92) * 400) + hs(b.x, 93) * 7) % 3 !== 0) r(ax, top - ah - 2, 2, 2, "#ff3b3b");
      }
      for (let wy = cfg.base - h + 4; wy < cfg.base - 4; wy += 5) {
        for (let wx = x + 2; wx < x + b.w - 2; wx += 4) if (hs(wx - x + b.w, wy) > cfg.dens && Math.floor(t / 1700 + hs(wx, wy) * 9) % 11 !== 0) r(wx, wy, 2, 2, cfg.win);
      }
    }
  }
}

/** A landmark tower in a layer: its position is fixed to the time of the round, so the signal and Batman come on cue. */
function landmark(t: number, cfg: Layer, Tmid: number, xmid: number, w: number, hgt: number, withRoof: boolean): { x: number; top: number; w: number } {
  const x = Math.round(xmid + (Tmid - mod(t, TL.cyc) / 1000) * cfg.v);
  const top = Math.round(cfg.base - hgt * cfg.hm);
  r(x, top, w, cfg.base - top, "#0e1226");
  r(x, top, w, 2, "#1a2040");
  r(x - 2, top - 3, w + 4, 3, "#161b36");
  for (let wy = top + 8; wy < cfg.base - 4; wy += 6) {
    for (let wx = x + 3; wx < x + w - 3; wx += 5) if (hs(wx - x, wy) > 0.5 && Math.floor(t / 1500 + hs(wx, wy) * 9) % 11 !== 0) r(wx, wy, 2, 3, cfg.win);
  }
  if (withRoof) {
    r(x, top - 6, 3, 6, "#161b36");
    r(x + w - 3, top - 6, 3, 6, "#161b36");
    r(x + w - 10, top - 14, 2, 14, "#161b36");
    if (Math.floor(t / 700) % 2) r(x + w - 10, top - 16, 2, 2, "#ff3b3b");
    r(x + Math.floor(w / 2) - 5, top - 10, 10, 10, "#161b36");
    // a pennant blowing with the wind
    for (let k = 0; k < 8; k++) r(x + w - 9 + WD * (k * 2 + 2), top - 16 + k * 0.2 + Math.sin(t / 140 + k * 0.7) * 1.3, 2, 3 - Math.floor(k / 4), "#e8392b");
  }
  return { x, top, w };
}

function sigK(t: number): number {
  const T = mod(t, TL.cyc);
  const S = (TL.sigMid - 4.5) * 1000;
  if (T < S || T > S + 9000) return 0;
  const a = T - S;
  if (a < 1400) return (Math.floor(a / 110) % 3 === 0 ? 0 : 1) * Math.min(1, a / 700);
  return a > 8000 ? Math.max(0, (9000 - a) / 1000) : 1;
}

function batK(t: number): number {
  const T = mod(t, TL.cyc);
  const B = TL.batStart * 1000;
  // Batman pops in with the first flash of lightning and pops out with the first flash of the last pair, so no fading
  return T >= B && T < B + 10000 ? 1 : 0;
}

/** Flashes of lightning: three as Batman appears, two as he disappears. Returns the time into the Batman window, or null. */
function lightningAt(t: number): number | null {
  const T = mod(t, TL.cyc) - TL.batStart * 1000;
  if (T < 0 || T > 11000) return null;
  const on = [0, 500, 1000, 10000, 10500].some((s0) => T >= s0 && T < s0 + 120);
  return on ? T : null;
}

function emblem(cx: number, cy: number, sc: number, col: string): void {
  const P = (x: number, y: number): void => r(cx + x * sc, cy + y * sc, sc, sc, col);
  for (let y = -4; y <= 2; y++) for (let x = -2; x <= 2; x++) P(x, y);
  for (const [x, y] of [[-2, -6], [-2, -5], [2, -6], [2, -5], [-1, -5], [1, -5], [-3, -4], [3, -4], [0, 3], [-1, 3], [1, 3]]) P(x, y);
  for (const s2 of [-1, 1]) {
    for (let x = 3; x <= 11; x++) {
      const yt = -4 - Math.floor((x - 3) / 4);
      const yb = 1 + (x < 5 ? 1 : 0) + ([6, 9].includes(x) ? 2 : 0) + (x % 3 === 0 ? 1 : 0) - Math.floor((x - 3) / 5);
      for (let y = yt; y <= yb; y++) P(s2 * x, y);
    }
  }
}

function lamp(x: number, y: number, k: number, tx: number, ty: number): [number, number] {
  const a = Math.atan2(ty - y, tx - x);
  r(x - 4, y, 2, 8, "#2a3050");
  r(x + 2, y, 2, 8, "#2a3050");
  r(x - 6, y + 7, 12, 2, "#1a2040");
  for (let i = 0; i < 12; i++) {
    const px = x + Math.cos(a) * i;
    const py = y - 3 + Math.sin(a) * i;
    r(px - 3, py - 3, 7, 7, i < 2 ? "#2a3050" : "#3a4468");
    r(px - 3, py - 3, 7, 1, "#5a6890");
  }
  const lx = x + Math.cos(a) * 12;
  const ly = y - 3 + Math.sin(a) * 12;
  disc(Math.round(lx), Math.round(ly), 4, k > 0 ? "#fffbd0" : "#4a5070", DK);
  if (k > 0) {
    c.globalAlpha = 0.3 * k;
    disc(Math.round(lx), Math.round(ly), 9, "#fff6b0");
    c.globalAlpha = 1;
  }
  return [lx, ly];
}

function beam(lx: number, ly: number, cx: number, cy: number, rx: number, k: number, t: number): void {
  if (k <= 0) return;
  c.globalAlpha = 0.16 * k;
  c.fillStyle = "#fff6b0";
  c.beginPath();
  c.moveTo(lx - 3, ly);
  c.lineTo(lx + 3, ly);
  c.lineTo(cx + rx, cy);
  c.lineTo(cx - rx, cy);
  c.closePath();
  c.fill();
  c.globalAlpha = 0.1 * k;
  c.fillStyle = "#ffffe8";
  c.beginPath();
  c.moveTo(lx - 1, ly);
  c.lineTo(lx + 1, ly);
  c.lineTo(cx + rx * 0.5, cy);
  c.lineTo(cx - rx * 0.5, cy);
  c.closePath();
  c.fill();
  for (let i = 0; i < 4; i++) {
    c.globalAlpha = 0.1 * k;
    c.strokeStyle = "#ffffff";
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(lx, ly);
    c.lineTo(cx + ((i - 1.5) / 1.5) * rx * 0.8, cy);
    c.stroke();
  }
  for (let i = 0; i < 18; i++) {
    const u = (t / 2600 + hs(i, 1)) % 1;
    c.globalAlpha = 0.5 * k * (1 - u * 0.5);
    r(lx + (cx - lx) * u + (hs(i, 2) - 0.5) * (8 + u * rx * 1.4) * 0.9, ly + (cy - ly) * u, 1, 1, "#ffffff");
  }
  c.globalAlpha = 1;
}

function signalCloud(cx: number, cy: number, rx: number, ry: number, k: number, flick: number): void {
  c.globalAlpha = 0.6 * k;
  for (const [dx, dy, w, h, col] of [[-80, -4, 160, 22, "#2a3358"], [-60, -16, 120, 16, "#323c66"], [-96, 6, 192, 10, "#222a4a"]] as [number, number, number, number, string][]) r(cx + dx, cy + dy, w, h, col);
  for (const [m, al] of [[1.5, 0.08], [1.25, 0.14], [1, 0.3], [0.8, 0.45], [0.6, 0.6]]) {
    c.globalAlpha = al * k * flick;
    c.fillStyle = m > 0.7 ? "#fff0a0" : "#ffffe0";
    c.beginPath();
    c.ellipse(cx, cy, rx * m, ry * m, 0, 0, 6.283);
    c.fill();
  }
  c.globalAlpha = 1;
}

/** Batman standing, facing right, with the cape streaming to the left, a pale rim light and a faint glow so he shows against the night. */
function batBody(x: number, y: number, t: number, dark: string, hi: string): void {
  r(x - 3, y - 6, 3, 6, dark);
  r(x + 1, y - 6, 3, 6, dark);
  r(x - 4, y - 1, 4, 1, "#0c0c10");
  r(x + 1, y - 1, 4, 1, "#0c0c10");
  r(x - 4, y - 14, 9, 9, dark);
  r(x - 4, y - 14, 9, 1, hi);
  r(x - 3, y - 8, 7, 1, "#e8b92d");
  r(x, y - 12, 3, 3, "#2a2a38");
  r(x + 1, y - 11, 1, 1, "#e8b92d");
  r(x - 5, y - 12, 10, 2, dark);
  r(x - 5, y - 12, 10, 1, hi);
  r(x - 3, y - 20, 6, 6, dark);
  r(x - 3, y - 24, 1, 4, dark);
  r(x + 2, y - 24, 1, 4, dark);
  r(x - 2, y - 17, 5, 2, "#f2c9a0");
  if (Math.floor(t / 1600) % 7 !== 0) {
    r(x, y - 19, 2, 1, "#ffffff");
    r(x + 2, y - 19, 1, 1, "#ffffff");
  }
  for (let k = 0; k < 14; k++) {
    const sw = Math.sin(t / 160 + k * 0.55) * 1 * (1 + k * 0.18);
    r(x - 5 - k * 2, y - 14 + k * 0.3 + sw, 3, 12 - Math.floor(k * 0.5), dark);
    r(x - 5 - k * 2, y - 14 + k * 0.3 + sw, 3, 1, hi);
  }
}

function batman(x: number, y: number, t: number): void {
  c.globalAlpha *= 0.18;
  c.fillStyle = "#7fa0ff";
  c.beginPath();
  c.ellipse(x - 6, y - 12, 22, 18, 0, 0, 6.283);
  c.fill();
  c.globalAlpha /= 0.18;
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) batBody(x + dx, y + dy, t, "#6a7ab0", "#6a7ab0");
  batBody(x, y, t, "#14141c", "#2a2a38");
}

function nightCity(t: number, w: number, TOP: number): void {
  TL = roundFor(w);
  bands(["#070a1a", "#0a0f26", "#101a3a", "#1a2650", "#23326a"], TOP, 236);
  if (TOP < 0) r(0, TOP, W, -TOP + 1, "#070a1a");
  stars(t, Math.round(50 * Math.max(1, w / 500)), 7, 140);
  disc(70, 48, 13, "#f4f1d8", "#d8d3b0");
  disc(74, 45, 11, "#0a0f26");
  // aircraft lights far away
  for (let i = 0; i < 3; i++) {
    const x = mod(hs(i, 4) * W + t * (0.012 + i * 0.004) * (i % 2 ? -1 : 1) * 60, W);
    if (Math.floor(t / 500 + i) % 2) r(x, 40 + i * 30, 2, 2, i % 2 ? "#ff3b3b" : "#ffffff");
  }
  const k = sigK(t);
  const bk = batK(t);
  let sTop = { x: 0, top: 0, w: 0 };
  let bTower = { x: 0, top: 0, w: 0 };
  const signal = (): void => {
    // the Bat-signal: a searchlight on one tower, the beam sweeping across a low cloud
    const cx = sTop.x - 30 + Math.sin(t / 1400) * 54;
    const cy = 34;
    const flick = k > 0 && Math.floor(t / 130) % 17 === 0 ? 0.55 : 1;
    if (k > 0) {
      const [lx, ly] = lamp(sTop.x + 8, sTop.top - 4, k, cx, cy);
      signalCloud(cx, cy, 52, 22, k, flick);
      beam(lx, ly, cx, cy, 52, k * flick, t);
      c.globalAlpha = k * flick;
      emblem(Math.round(cx - 1), Math.round(cy - 1), 3, "#14141c");
      c.globalAlpha = 1;
    } else lamp(sTop.x + 8, sTop.top - 4, 0, sTop.x - 30, 34);
  };
  LAYERS.forEach((cfg, idx) => {
    drawLayer(t, LAY[idx], cfg, idx >= 2);
    if (idx === 1) {
      // a lit clock tower in the mid-far layer
      const cx2 = mod(300 - (t * cfg.v) / 1000, Math.max(700, w + 120)) - 60;
      const ct = cfg.base - 120 * cfg.hm;
      r(cx2, ct - 10, 28, 120 * cfg.hm + 10, "#111b3c");
      r(cx2 + 3, ct - 18, 22, 10, "#161e44");
      r(cx2 + 11, ct - 26, 6, 8, "#161e44");
      disc(cx2 + 14, Math.round(ct - 8), 6, "#ffe9a0", DK);
      r(cx2 + 14, Math.round(ct - 12), 1, 5, DK);
      r(cx2 + 14, Math.round(ct - 8), 4, 1, DK);
    }
    if (idx === 1) {
      sTop = landmark(t, cfg, TL.sigMid, 0.7 * w, 46, 170, true);
      signal();
    }
    if (idx === 2) bTower = landmark(t, cfg, TL.batMid, 0.6 * w, 44, 170, false);
  });
  // Batman on a different tower, shown by flashes of lightning
  if (bk > 0) {
    batman(bTower.x + bTower.w - 12, bTower.top - 3, t);
    if (Math.floor(t / 90) % 23 === 0) {
      c.globalAlpha = 0.2;
      r(0, TOP - 4, W, 240 - TOP, "#cfe0ff");
      c.globalAlpha = 1;
    }
  }
  if (lightningAt(t) !== null) {
    c.globalAlpha = 0.4;
    r(0, TOP - 4, W, 240 - TOP, "#cfe0ff");
    c.globalAlpha = 1;
  }
  meetTrain(t, "lit", 6000, 1600);
  // rain leaning with the wind, and streaks blowing past
  c.globalAlpha = 0.3;
  for (let i = 0; i < 80 * Math.max(1, w / 500); i++) {
    const x = mod(hs(i, 1) * W + WD * t * 0.1, W);
    const y = mod(hs(i, 2) * 300 + t * 0.5, 300) - 40;
    line(x + 4, y - 6, x, y, "#bfd6ff");
  }
  c.globalAlpha = 1;
  for (let i = 0; i < 10; i++) {
    c.globalAlpha = 0.35;
    r(mod(hs(i, 3) * W * 2 + WD * t * (0.6 + hs(i, 4) * 0.8) * 0.5, W + 80) - 40, 60 + hs(i, 1) * 170, 14 + hs(i, 2) * 30, 1, "#9fb4e8");
    c.globalAlpha = 1;
  }
}

function mesa(x: number, base: number, w: number, h: number, col: string, shade: string): void {
  r(x, base - h, w, h, col);
  r(x - 4, base - h + Math.floor(h * 0.45), w + 8, Math.floor(h * 0.55), col);
  r(x + w * 0.15, base - h - 6, w * 0.7, 6, col);
  r(x + 3, base - h, 2, h, shade);
}

// ---- The canyon tunnel: one long isometric cliff block with a timber-framed mouth, a cutaway along its side that shows the dark
// inside (the wall carved out of the dark by lamps and the headlight), and a different arched opening at the far end.
const TUN_PERIOD = 38000;
const TUN_START = 25000;
const TUN_LEN = 2400;
const TUN_SPEED = 520;
const T_TOP = 40; // top edge of the block's side face
const T_SK = 30; // how far the top surface recedes
const T_D = 60; // width of the mouth face
const T_SLT = 84; // top of the cutaway (the tunnel ceiling)
const T_GY = 236;
const T_EXL = 90;
const TIM = "#7a5430";
const TIM_DK = "#4a321c";
const HOLE = "#090705";

let tunInt: HTMLCanvasElement | null = null;
let tunDark: HTMLCanvasElement | null = null;
let tunTex: { face: CanvasPattern; side: CanvasPattern; top: CanvasPattern } | null = null;
/** The screen span (x) the tunnel block covers right now, or null; used to dim the roof's far strip. */
let tunSpan: [number, number] | null = null;

function mkTex(cols: string[], cw: number, ch: number, seed: number): CanvasPattern {
  const k = document.createElement("canvas");
  k.width = 96;
  k.height = 96;
  const g = k.getContext("2d")!;
  for (let y = 0; y < 96; y += ch) {
    for (let x = 0; x < 96; x += cw) {
      g.fillStyle = cols[Math.floor(hs(x / cw + seed, y / ch + seed * 3) * cols.length)];
      g.fillRect(x, y, cw, ch);
    }
  }
  return g.createPattern(k, "repeat")!;
}

function glowAt(x: number, y: number, rad: number, rgb: string, a: number): void {
  const g = c.createRadialGradient(x, y, 2, x, y, rad);
  g.addColorStop(0, `rgba(${rgb},${a})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  c.fillStyle = g;
  c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
}

function lampFlicker(i: number, s: number): number {
  const depth = Math.min(1, Math.max(0, (s - 2) / 3.5));
  return hs(i, Math.floor(s * 9)) < depth * 0.22 ? 0.25 : 1;
}

/** The inside of the tunnel: an almost black wall with the light carved out around the lamps and the headlight. */
function tunnelInterior(t: number, s: number): void {
  c.save();
  c.beginPath();
  c.rect(0, 0, W, 236);
  c.clip();
  r(0, 0, W, 236, "#0a0710");
  const f = (t * 260) / 1000;
  for (let x = 0; x < W; x += 10) {
    for (let y = 0; y < 236; y += 8) {
      const n = hs(Math.floor((x + f) / 10), y);
      r(x, y, 10, 8, ["#2a2630", "#322d38", "#25212c"][Math.floor(n * 3)]);
    }
  }
  for (let y = 20; y < 236; y += 36) r(0, y, W, 1, "#14101a");
  for (let x = 0; x < W; x += 2) {
    r(x, 60 + Math.sin((x + f * 0.4) / 80) * 2, 2, 3, "#3a3342");
    r(x, 66 + Math.sin((x + f * 0.4) / 80) * 2, 2, 1, "#5a4f66");
  }
  tunDark = tunDark ?? document.createElement("canvas");
  if (tunDark.width !== W) tunDark.width = W;
  tunDark.height = 236;
  const dk = tunDark.getContext("2d")!;
  dk.globalCompositeOperation = "source-over";
  dk.clearRect(0, 0, W, 236);
  dk.fillStyle = "rgba(3,2,8,.9)";
  dk.fillRect(0, 0, W, 236);
  dk.globalCompositeOperation = "destination-out";
  const lamps = Math.ceil((W + 200) / 200);
  for (let i = 0; i < lamps; i++) {
    const x = mod(i * 200 - (t * 520) / 1000, W + 200) - 60;
    const on = lampFlicker(i, s);
    const g = dk.createRadialGradient(x, T_SLT + 14, 4, x, T_SLT + 14, 160 * on);
    g.addColorStop(0, "rgba(0,0,0,1)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    dk.fillStyle = g;
    dk.fillRect(x - 130, 0, 260, 236);
  }
  const hg = dk.createLinearGradient(W, 150, W - 260, 150);
  hg.addColorStop(0, "rgba(0,0,0,.95)");
  hg.addColorStop(1, "rgba(0,0,0,0)");
  dk.fillStyle = hg;
  dk.beginPath();
  dk.moveTo(W, 130);
  dk.lineTo(W, 200);
  dk.lineTo(W - 300, 236);
  dk.lineTo(W - 300, 60);
  dk.closePath();
  dk.fill();
  c.drawImage(tunDark, 0, 0);
  for (let i = 0; i < lamps; i++) {
    const x = Math.round(mod(i * 200 - (t * 520) / 1000, W + 200) - 60);
    const on = lampFlicker(i, s);
    r(x - 7, T_SLT + 2, 14, 5, "#2a2430");
    r(x - 5, T_SLT + 7, 10, 3, on > 0.5 ? "#fff0b0" : "#5a4a40");
  }
  c.globalAlpha = 0.4;
  for (let i = 0; i < 30; i++) r(mod(hs(i, 1) * W - t * 0.3, W), 20 + hs(i, 2) * 200, 1, 1, "#cfc4b0");
  c.globalAlpha = 1;
  c.restore();
}

function tpoly(pts: number[][]): void {
  c.beginPath();
  c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
  c.closePath();
  c.fill();
}

function exitTop(x: number, L: number): number {
  const k = Math.max(0, (x - (L - T_EXL)) / T_EXL);
  return T_SLT - 30 * (1 - (1 - k) * (1 - k));
}

function drawTunnelBlock(X: number, L: number, t: number, s: number, inner: HTMLCanvasElement): void {
  tunTex = tunTex ?? {
    face: mkTex(["#7a6a5c", "#847464", "#706052", "#8a7a6a"], 6, 4, 7),
    side: mkTex(["#665648", "#706050", "#5c4e42", "#76665a"], 6, 4, 8),
    top: mkTex(["#98886a", "#a0906e", "#8e7e62"], 4, 3, 9),
  };
  const P = tunTex;
  const D = T_D;
  const TS = T_TOP;
  const SK = T_SK;
  const SLT = T_SLT;
  const GY = T_GY;
  c.save();
  c.beginPath();
  c.rect(0, 0, W, 236);
  c.clip();
  c.translate(X, 0);
  const xa = Math.max(D, -X - 60);
  const xb = Math.min(L, W - X + 60);
  c.fillStyle = P.top;
  tpoly([[0, TS - SK], [D, TS], [L, TS], [L - D, TS - SK]]);
  c.fillStyle = P.side;
  c.fillRect(D, TS, L - D, GY - TS);
  c.fillStyle = P.face;
  tpoly([[0, TS - SK], [D, TS], [D, GY], [0, GY - SK]]);
  c.fillStyle = "#ffffff30";
  c.fillRect(D, TS, L - D, 2);
  c.fillStyle = "#00000030";
  c.fillRect(D, GY - 8, L - D, 8);
  c.fillStyle = "#ffffff40";
  tpoly([[0, TS - SK], [D, TS], [D, TS + 2], [0, TS - SK + 2]]);
  // cracks, strata and scrub on the cliff
  for (let y = TS + 12; y < SLT - 14; y += 14) {
    c.fillStyle = "#00000024";
    c.fillRect(D, y, L - D, 1);
  }
  for (let x = Math.floor(xa / 55) * 55; x < xb; x += 55) {
    const h = hs(x / 55, 4);
    c.fillStyle = "#00000026";
    c.fillRect(x + h * 30, TS + 10, 2, 50 + h * 40);
  }
  for (let x = Math.floor(xa / 40) * 40; x < xb; x += 40) {
    const h = hs(x / 40, 6);
    if (h > 0.3) {
      c.fillStyle = "#4a6a34";
      c.fillRect(x + h * 20, TS - 10 - h * 12, 6, 5);
      c.fillStyle = "#6a8a4a";
      c.fillRect(x + 2 + h * 20, TS - 13 - h * 12, 3, 4);
    }
  }
  // the cutaway: the inside of the tunnel, carrying on from the mouth
  c.save();
  c.beginPath();
  c.moveTo(D, SLT);
  for (let x = L - T_EXL; x <= L; x += 5) c.lineTo(x, exitTop(x, L));
  c.lineTo(L, GY);
  c.lineTo(D, GY);
  c.closePath();
  c.fillStyle = HOLE;
  c.fill();
  c.clip();
  c.translate(-X, 0);
  c.drawImage(inner, 0, 0);
  c.restore();
  // timber lintel, braces and lanterns along the cutaway
  const le = Math.min(L - T_EXL, xb);
  for (let x = Math.max(D, Math.floor(xa / 14) * 14); x < le; x += 14) {
    c.fillStyle = TIM;
    c.fillRect(x, SLT - 9, 14, 9);
    c.fillStyle = "#00000030";
    c.fillRect(x, SLT - 9, 1, 9);
  }
  for (let x = Math.floor(xa / 120) * 120 + 60; x < le; x += 120) {
    c.fillStyle = TIM_DK;
    c.fillRect(x, SLT, 4, 16);
    c.fillRect(x + 1, SLT + 14, 2, 4);
  }
  for (let x = Math.floor(xa / 240) * 240 + 120; x < le; x += 240) {
    c.fillStyle = "#2a2a32";
    c.fillRect(x, SLT, 1, 10);
    c.fillStyle = "#e8a23a";
    c.fillRect(x - 3, SLT + 10, 7, 8);
    c.fillStyle = "#fff0b0";
    c.fillRect(x - 2, SLT + 11, 5, 5);
    c.globalCompositeOperation = "lighter";
    glowAt(x, SLT + 14, 40, "255,190,90", 0.5);
    c.globalCompositeOperation = "source-over";
  }
  // the exit: an arch that rises toward the end of the block, with a jamb
  for (const [col, lw, dy] of [[TIM, 6, 3], [TIM_DK, 2, 7]] as [string, number, number][]) {
    c.strokeStyle = col;
    c.lineWidth = lw;
    c.beginPath();
    for (let x = L - T_EXL; x <= L; x += 5) {
      const y = exitTop(x, L) - dy;
      if (x === L - T_EXL) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.stroke();
  }
  c.fillStyle = TIM;
  c.fillRect(L - 7, SLT - 34, 7, GY - SLT + 34);
  c.fillStyle = TIM_DK;
  c.fillRect(L - 7, SLT - 34, 2, GY - SLT + 34);
  // the mouth in the end face: a skewed timber-framed opening that runs on into the cutaway
  for (let x = 0; x < D; x++) {
    const u = x / D;
    const top = TS - SK + SK * u;
    const bot = GY - SK + SK * u;
    if (u < 0.12) {
      c.fillStyle = TIM;
      c.fillRect(x, top, 1, bot - top);
      continue;
    }
    const bump = u < 0.34 ? 20 * Math.pow(1 - (u - 0.12) / 0.22, 2) : 0;
    const cap = Math.round(T_SLT - 30 + 30 * u + bump);
    c.fillStyle = HOLE;
    c.fillRect(x, cap, 1, bot - cap);
    c.fillStyle = TIM;
    c.fillRect(x, cap - 9, 1, 9);
  }
  const lx = Math.round(D * 0.6);
  const ly = Math.round(T_SLT - 30 + 30 * 0.6);
  c.fillStyle = "#2a2a32";
  c.fillRect(lx, ly, 1, 10);
  c.fillStyle = "#e8a23a";
  c.fillRect(lx - 3, ly + 10, 7, 8);
  c.fillStyle = "#fff0b0";
  c.fillRect(lx - 2, ly + 11, 5, 5);
  c.restore();
  void t;
  void s;
}

/** Draws the tunnel block over the backdrop when it is time for one; records which part of the screen it covers. */
function tunnel(t: number): void {
  tunSpan = null;
  const s = (t % TUN_PERIOD - TUN_START) / 1000;
  if (s < 0 || s * TUN_SPEED > W + 10 + TUN_LEN + 20) return;
  tunInt = tunInt ?? document.createElement("canvas");
  if (tunInt.width !== W) tunInt.width = W;
  tunInt.height = 236;
  const save = c;
  c = tunInt.getContext("2d")!;
  c.clearRect(0, 0, W, 236);
  tunnelInterior(t, s);
  c = save;
  const X = Math.round(W + 10 - s * TUN_SPEED);
  drawTunnelBlock(X, TUN_LEN, t, s, tunInt);
  tunSpan = [Math.max(44, X), Math.min(W, X + TUN_LEN)];
}

// ---- Canyon gangs: two gangs ride in from the left (we are catching up with them), shoot at each other, leap onto enemy horses and
// lasso each other off theirs, then fall behind to the left again. Everything faces right; the left half shoots forward, the right half back.
const G_PERIOD = 38000;
const G_START = 4000;
const G_LEN = 13.4; // seconds
const G_SKIN = "#e8b890";
const G_JEANS = "#2a3a5a";
const G_GROUND = 120; // px/s the ground scrolls left
const G_FALL_T = 0.449;
const G_T_IN = 3.4;

interface GRider {
  rest: number; gy: number; ph: number; ent: number; ex: number; aim: number; shots: number[];
  hc: string; hd: string; mn: string; pc: string; hat: string;
}
interface GEvent { k: "jump" | "lasso"; who: number; target: number; t: number }

let gOX = 0;
let gGY = 226;
const gR = (lx: number, ly: number, w: number, h: number, col: string): void => r(gOX + lx, gGY + ly, w, h, col);
const gEase = (u: number): number => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

function gPuff(x: number, y: number, sz: number, col: string, a: number): void {
  c.globalAlpha = Math.max(0, a);
  r(x - sz / 2, y - sz / 2, sz, sz * 0.8, col);
  c.globalAlpha = 1;
}

function gHorse(ph: number, col: string, dark: string, mane: string, b: number, riderless: boolean): void {
  for (const [l, o] of [[3, 0], [7, 1.6], [17, 3.1], [21, 4.7]]) {
    const fx = Math.round(Math.sin(ph + o) * 6);
    const fyy = -Math.round(Math.max(0, Math.cos(ph + o)) * 4);
    const hy = -8 + b;
    const n = 8;
    for (let i = 0; i <= n; i++) gR(Math.round(l + (fx * i) / n), Math.round(hy + ((0 - hy + fyy) * i) / n), 2, 1, dark);
    gR(l + fx - 1, fyy - 1, 4, 2, "#1c1c22");
  }
  gR(-7, -15 + b, 8, 3, mane);
  gR(-9, -13 + b, 5, 6, mane);
  gR(0, -16 + b, 24, 10, col);
  gR(1, -17 + b, 22, 2, "#ffffff22");
  gR(2, -8 + b, 20, 2, "#00000030");
  gR(19, -24 + b, 7, 10, col);
  gR(21, -26 + b, 6, 4, col);
  gR(25, -27 + b, 9, 5, col);
  gR(33, -25 + b, 2, 4, dark);
  gR(27, -29 + b, 2, 3, col);
  gR(31, -26 + b, 2, 2, "#1c1c22");
  gR(17, -27 + b, 3, 12, mane);
  gR(20, -29 + b, 2, 3, mane);
  gR(8, -18 + b, 7, 3, "#6a3a1a");
  gR(9, -19 + b, 5, 1, "#a05a2a");
  if (riderless) {
    gR(23, -12 + b, 2, 5, "#6a3a1a");
    gR(5, -14 + b, 1, 3, "#6a3a1a");
  }
}

/** pose: 0 hands down, 1 aiming forward, -1 aiming back, 2 lasso swinging overhead, 3 holding the rope */
function gCowboy(pose: number, pc: string, hat: string, b: number): void {
  gR(10, -23 + b, 5, 10, pc);
  gR(10, -23 + b, 5, 2, "#00000025");
  gR(9, -14 + b, 7, 3, "#3a2a1c");
  gR(11, -14 + b, 3, 8, G_JEANS);
  gR(12, -7 + b, 3, 2, "#1c1c22");
  gR(11, -29 + b, 4, 5, G_SKIN);
  gR(10, -31 + b, 6, 2, hat);
  gR(8, -30 + b, 10, 1, hat);
  gR(11, -33 + b, 4, 3, hat);
  gR(10, -25 + b, 5, 1, "#d9342b");
  if (pose === 0) {
    gR(10, -21 + b, 2, 7, pc);
    gR(10, -14 + b, 2, 2, "#3a2a1c");
  } else if (pose === 1) {
    gR(13, -22 + b, 9, 2, pc);
    gR(21, -24 + b, 5, 4, "#1c1c22");
    gR(25, -23 + b, 2, 2, "#8a8a96");
  } else if (pose === -1) {
    gR(3, -22 + b, 9, 2, pc);
    gR(-1, -24 + b, 5, 4, "#1c1c22");
    gR(-2, -23 + b, 2, 2, "#8a8a96");
  } else if (pose === 2) {
    gR(13, -32 + b, 2, 10, pc);
    gR(13, -34 + b, 3, 3, G_SKIN);
  } else {
    gR(13, -22 + b, 7, 2, pc);
    gR(19, -23 + b, 3, 3, G_SKIN);
  }
}

function gTumbling(x: number, y: number, t2: number, pc: string, hat: string): void {
  const ang = Math.floor(t2 * 10) % 4;
  r(x, y - 8, 6, 8, pc);
  r(x + 1, y - 12, 4, 4, G_SKIN);
  r(x - 1, y - 13, 8, 2, hat);
  if (ang % 2) {
    r(x - 3, y - 6, 3, 2, G_JEANS);
    r(x + 6, y - 10, 3, 2, G_JEANS);
  } else {
    r(x - 2, y - 2, 3, 2, G_JEANS);
    r(x + 6, y - 4, 3, 2, G_JEANS);
  }
}

function gLying(x: number, y: number, pc: string, hat: string, dust: number): void {
  r(x - 2, y - 5, 16, 5, pc);
  r(x + 13, y - 6, 5, 5, G_SKIN);
  r(x + 14, y - 8, 7, 2, hat);
  r(x - 8, y - 4, 6, 3, G_JEANS);
  for (let k = 0; k < 3; k++) gPuff(x + 4 + k * 5, y - 6 - k * 3, 5 + k * 2, "#d8b890", dust);
}

function gFlying(x: number, y: number, pc: string, hat: string): void {
  r(x, y, 9, 5, pc);
  r(x + 9, y - 2, 4, 4, G_SKIN);
  r(x + 8, y - 4, 7, 2, hat);
  r(x - 5, y + 1, 6, 3, G_JEANS);
  r(x + 12, y, 6, 2, pc);
  r(x + 17, y - 1, 3, 3, G_SKIN);
}

function gFallPos(x0: number, y0: number, t2: number): { x: number; y: number; landed: boolean } {
  const air = Math.min(t2, G_FALL_T);
  const yy = -22 - 70 * air + 260 * air * air;
  const landed = t2 >= G_FALL_T;
  return { x: x0 - 45 * air - (landed ? (t2 - G_FALL_T) * G_GROUND : 0), y: landed ? y0 : y0 + Math.min(yy, 0), landed };
}

function gTrackX(R: GRider, u: number): number {
  if (u < G_T_IN) return -110 - R.ent + (R.rest + 110 + R.ent) * gEase(u / G_T_IN);
  if (u < R.ex) return R.rest + Math.sin(u * 1.7 + R.ph) * 3;
  const d = u - R.ex;
  return R.rest + Math.sin(R.ex * 1.7 + R.ph) * 3 - d * d * 75;
}

const G_PA = [
  { hc: "#8a5a30", hd: "#6a4020", mn: "#2a1a10", pc: "#3a6a9a", hat: "#e8e0d0" },
  { hc: "#a8a090", hd: "#7a7060", mn: "#6a6258", pc: "#4a8a9a", hat: "#e8e0d0" },
  { hc: "#b08a50", hd: "#8a6a38", mn: "#e8e0c8", pc: "#2a6aaa", hat: "#f0e8d0" },
];
const G_PB = [
  { hc: "#2a2a30", hd: "#1c1c22", mn: "#0c0c10", pc: "#a83a2a", hat: "#1c1c22" },
  { hc: "#3a2a22", hd: "#241812", mn: "#0c0c10", pc: "#d9342b", hat: "#2a2a30" },
  { hc: "#5a3a22", hd: "#3a2414", mn: "#1c1008", pc: "#8a2a3a", hat: "#1c1c22" },
];

// nine riders bunched up, mostly blue on the left and mostly red on the right; the left half shoots forward, the right half back
const G_LIST: [string, number, number][] = [["A", 60, 228], ["A", 110, 222], ["A", 165, 228], ["B", 215, 222], ["A", 265, 228], ["B", 320, 222], ["B", 375, 228], ["B", 425, 222], ["A", 470, 228]];
const G_EVENTS: GEvent[] = [
  { k: "jump", who: 3, target: 2, t: 4.6 },
  { k: "lasso", who: 6, target: 4, t: 6.6 },
  { k: "jump", who: 8, target: 7, t: 8.0 },
];
let gRiders: GRider[] | null = null;

function gangRiders(): GRider[] {
  return G_LIST.map(([g, rest, gy], i) => {
    const P = (g === "A" ? G_PA : G_PB)[Math.floor(hs(i, 7) * 3) % 3];
    const shots: number[] = [];
    let t = 3.6 + hs(i, 11) * 1.2;
    while (t < 9.8) {
      shots.push(+t.toFixed(2));
      t += 1.3 * (0.7 + hs(i, Math.floor(t * 10)) * 0.9);
    }
    return { ...P, rest, gy, ph: i * 0.9, ent: g === "A" ? i * 6 : 30 + i * 6, ex: 10.2 + hs(i, 3) * 0.8, aim: rest < 270 ? 1 : -1, shots };
  });
}

/** Can rider m shoot at time ts, or is he busy leaping, lassoing or already knocked off? */
function gFree(m: number, ts: number): boolean {
  for (const e of G_EVENTS) {
    if (e.k === "lasso") {
      if (e.who === m && ts >= e.t - 1.3 && ts < e.t + 1.6) return false;
      if (e.target === m && ts >= e.t + 0.3) return false;
    } else {
      if (e.who === m && ts >= e.t - 0.3) return false;
      if (e.target === m && ts >= e.t + 0.6) return false;
    }
  }
  return true;
}

function gangs(t: number): void {
  const u = (t % G_PERIOD - G_START) / 1000;
  if (u < 0 || u > G_LEN) return;
  gRiders = gRiders ?? gangRiders();
  const H = gRiders;
  const E = G_EVENTS;
  const xo = Math.round((W - 500) / 2);
  const xs = H.map((R) => Math.round(gTrackX(R, u)) + xo);
  const mount = H.map((_, i) => i);
  for (const e of E) {
    if (e.k === "jump") {
      if (u >= e.t) mount[e.who] = -1;
      if (u >= e.t + 0.7) mount[e.target] = e.who;
    } else if (u >= e.t + 0.45) mount[e.target] = -1;
  }
  const lassoOf = (i: number): GEvent | null => E.find((e) => e.k === "lasso" && e.who === i) ?? null;
  const releaseOf = (who: number): number => {
    let te = 1e9;
    for (const e of E) if (e.k === "jump" && e.target === who) te = Math.min(te, e.t + 0.7);
    return te;
  };
  const over: (() => void)[] = [];
  for (let i = 0; i < H.length; i++) {
    const R = H[i];
    gOX = xs[i];
    gGY = R.gy;
    const ph = u * 15 + R.ph;
    const bob = -Math.round(Math.abs(Math.sin(ph)) * 1.6);
    const m = mount[i];
    for (let k = 0; k < 7; k++) gPuff(gOX - 8 - k * 9, R.gy - 2 - k * 1.4, 3 + k, "#d8b890", 0.5 - k * 0.07);
    gHorse(ph, R.hc, R.hd, R.mn, bob, m < 0);
    if (m < 0) continue;
    const C = H[m];
    let pose = 0;
    const lt = lassoOf(m);
    if (lt) {
      const te = releaseOf(m);
      if (u >= lt.t - 1.2 && u < lt.t) pose = 2;
      else if (u >= lt.t && u < te) pose = 3;
    }
    let shotPose = 0;
    if (pose === 0 && m === i) {
      for (const ts of C.shots) {
        if (u >= ts - 0.18 && u < ts + 0.4 && gFree(m, ts)) {
          shotPose = C.aim;
          break;
        }
      }
    }
    gCowboy(pose || shotPose, C.pc, C.hat, bob);
    if (m === i) {
      for (const ts of C.shots) {
        const dt = u - ts;
        if (dt < 0 || dt > 1.1 || !gFree(m, ts)) continue;
        const mx = gOX + (C.aim > 0 ? 27 : -3);
        const my = R.gy - 22 + bob;
        if (dt < 0.1) {
          disc(Math.round(mx + C.aim * 4), my, 3, "#fff3a0", "#ffb020");
          r(mx + C.aim * (dt < 0.05 ? 9 : 6) - 1, my - 1, 3, 3, "#ffffff");
        }
        if (dt < 0.45) {
          const bx = mx + C.aim * (8 + dt * 760);
          for (let k = 0; k < 4; k++) {
            c.globalAlpha = 1 - k * 0.22;
            r(bx - C.aim * k * 5, my, 4, 1, "#fff6c0");
          }
          c.globalAlpha = 1;
        }
        gPuff(mx + C.aim * (6 + dt * 10) - dt * 40, my - dt * 18, 4 + dt * 16, "#d8d8e0", 0.55 * (1 - dt / 1.1));
      }
    }
    if (pose === 2) {
      const hx = gOX + 14;
      const hy = R.gy - 35 + bob;
      const spin = u * 16;
      for (let k = 0; k < 30; k++) {
        const a = k * 0.21 + spin;
        r(hx + Math.cos(a) * 11, hy + Math.sin(a) * 3.5 - 1, 1, 1, "#e8c880");
      }
      line(Math.round(hx), Math.round(hy + 2), Math.round(hx + 3), Math.round(hy + 4), "#e8c880");
    }
  }
  const hand = (w: number, tt: number): number => Math.round(gTrackX(H[w], tt)) + xo + 14;
  for (const e of E) {
    if (e.k === "lasso") {
      const T = e.target;
      const Wr = e.who;
      const hx = xs[Wr] + 14;
      const hy = H[Wr].gy - 24;
      const ty = e.t + 0.45;
      const te = releaseOf(Wr);
      if (u >= e.t && u < ty) {
        const p = (u - e.t) / 0.45;
        const lx = hx + (xs[T] + 13 - hx) * p;
        const ly = hy + (H[T].gy - 22 - hy) * p - Math.sin(p * 3.14) * 10;
        line(Math.round(hx), Math.round(hy), Math.round(lx), Math.round(ly), "#e8c880");
        for (let k = 0; k < 14; k++) r(lx + Math.cos(k * 0.45) * 5, ly + Math.sin(k * 0.45) * 3, 1, 1, "#e8c880");
      }
      if (u >= ty) {
        const t2 = u - ty;
        const Ch = H[T];
        const f = gFallPos(xs[T] + 12, Ch.gy, Math.min(t2, 0.9));
        const tt = Math.min(u, te);
        const aim = Math.round(gTrackX(H[Wr], tt)) + xo - 58;
        const pull = gEase((t2 - 0.45) / 0.9);
        let bx = t2 < 0.45 ? f.x : f.x + (aim - f.x) * pull;
        const by = t2 < 0.45 ? f.y : Ch.gy + (H[Wr].gy - Ch.gy) * pull;
        if (u > te) bx -= (u - te) * G_GROUND;
        if (t2 < 0.45) over.push(() => gTumbling(Math.round(bx), Math.round(by), t2, Ch.pc, Ch.hat));
        else {
          over.push(() => {
            if (u < te) line(hand(Wr, tt), Math.round(H[Wr].gy - 24), Math.round(bx + 3), Math.round(by - 3), "#e8c880");
            gLying(Math.round(bx), Math.round(by), Ch.pc, Ch.hat, 0.55);
            for (let k = 0; k < 5; k++) gPuff(bx - 6 - k * 7, by - 2 - k, 4 + k, "#d8b890", 0.45 - k * 0.07);
          });
        }
      }
    } else {
      const Wr = e.who;
      const T = e.target;
      const Ch = H[Wr];
      if (u >= e.t && u < e.t + 0.7) {
        const p = (u - e.t) / 0.7;
        const x0 = xs[Wr] + 8;
        const y0 = H[Wr].gy - 22;
        const x1 = xs[T] + 8;
        const y1 = H[T].gy - 22;
        over.push(() => gFlying(Math.round(x0 + (x1 - x0) * p), Math.round(y0 + (y1 - y0) * p - Math.sin(p * 3.14) * (16 + Math.abs(x1 - x0) * 0.12)), Ch.pc, Ch.hat));
      }
      if (u >= e.t + 0.7) {
        const Tc = H[T];
        const t2 = u - e.t - 0.7;
        const f = gFallPos(xs[T] + 12, Tc.gy, t2);
        over.push(() => {
          if (!f.landed) gTumbling(Math.round(f.x), Math.round(f.y), t2, Tc.pc, Tc.hat);
          else gLying(Math.round(f.x), Math.round(f.y), Tc.pc, Tc.hat, Math.max(0, 0.55 - (t2 - G_FALL_T) * 0.25));
        });
      }
    }
  }
  for (const f of over) f();
}

const FAR: Record<TrainScene, { far: string; hi: string; rail: string; vent: string }> = {
  day: { far: "#8a95a8", hi: "#b8c4d6", rail: "#9aa6b8", vent: "#b4becc" },
  night: { far: "#2a3350", hi: "#4a5a86", rail: "#4a5a86", vent: "#3a456a" },
  canyon: { far: "#7a5a4a", hi: "#b08a6a", rail: "#9a7a5a", vent: "#8a6a50" },
};

/**
 * Draws the scenery and the roof's far edge. topY = the top of the backdrop in the game's local coordinates
 * (its bottom is y = 76, where the roof's far edge starts; the court begins at y = 92).
 */
export function drawTrain(ctx: CanvasRenderingContext2D, scene: TrainScene, t: number, w: number, topY: number): void {
  c = ctx;
  W = w;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, topY, w, 92 - topY);
  ctx.clip();
  ctx.translate(0, -OFFSET);
  const TOP = topY + OFFSET;
  if (scene === "day") {
    bands(["#8ec9ff", "#9ed0ff", "#b7dcff", "#cfe9ff"], TOP, 150 + (TOP > 0 ? 0 : 0));
    r(0, 150, W, 90, "#cfe9ff");
    if (TOP < 0) r(0, TOP, W, -TOP + 1, "#8ec9ff");
    disc(Math.round(w * 0.84), 52, 16, "#fff3a0", "#ffd24a");
    clouds(t, Math.round(5 * Math.max(1, w / 500)), 3, 6, 18, 120, "#ffffff", "#d9e8f7", 3);
    clouds(t, Math.round(3 * Math.max(1, w / 500)), 1, 1.2, 10, 90, "#eaf5ff", "#cfe3f7", 4);
    hills(t, 10, 170, 22, 0.012, 0.031, "#7fb8e0", "#a6d1f0", 1);
    hills(t, 30, 196, 18, 0.02, 0.047, "#5ab36a", "#7fd08a", 2);
    const off = (t * 70) / 1000;
    for (let x = 0; x < W; x++) {
      r(x, 206, 1, 30, Math.floor((x + off) / 22) % 2 ? "#9acb4a" : "#86b83c");
      r(x, 206, 1, 1, "#5a8a2a");
    }
    along(t, 70, 120, (x, k) => hs(k, 9) > 0.45 && tree(x, 204, 10 + Math.floor(hs(k, 2) * 8), "#2f8f4a", "#5ac878"));
    along(t, 70, 330, (x) => {
      r(x, 196, 26, 14, "#c0605a");
      r(x + 3, 191, 20, 6, "#7a3a32");
      r(x + 10, 201, 5, 9, "#4a2f1a");
    });
    wires(t, 180, 230, 196, 8, "#2a2a32");
    along(t, 180, 230, (x) => pole(x, 190, ROOF_BACK - 14, "#4a3020"));
    meetTrain(t, "pass", 33000, 1900, 40000);
    bulletTrain(t);
    smoke(t, 8, "#e8edf4");
    wind(t, 10, "#ffffff", 500);
  } else if (scene === "night") {
    nightCity(t, w, TOP);
  } else {
    bands(["#3a2a6a", "#7a3a7a", "#c0507a", "#e8732f", "#ffa94d", "#ffd27a"], TOP, 236);
    if (TOP < 0) r(0, TOP, W, -TOP + 1, "#3a2a6a");
    disc(Math.round(w * 0.6), 190, 34, "#ffe9a0", "#ffcf5a");
    const far = (t * 14) / 1000;
    const near = (t * 40) / 1000;
    for (let rep = -1; rep * 500 < w + 500; rep++) {
      for (const m of [[40, 60, 40], [160, 90, 64], [320, 50, 34]]) mesa(Math.round(m[0] + rep * 500 - mod(far, 500)), 236, m[2], m[1], "#8a3a5a", "#6a2a48");
    }
    for (let rep = -1; rep * 500 < w + 500; rep++) {
      for (const m of [[20, 70, 56], [210, 100, 80], [400, 56, 44]]) mesa(Math.round(m[0] + rep * 500 - mod(near, 500)), 236, m[2], m[1], "#b0482f", "#8a3422");
    }
    r(0, 226, W, 10, "#c0702f");
    along(t, 120, 150, (x, k) => {
      const h = 18 + Math.floor(hs(k, 2) * 14);
      r(x, 226 - h, 4, h, "#2f8f4a");
      r(x - 5, 226 - h + 6, 3, 8, "#2f8f4a");
      r(x - 5, 226 - h + 12, 8, 2, "#2f8f4a");
      r(x + 4, 226 - h + 4, 3, 8, "#2f8f4a");
      r(x + 4, 226 - h + 10, 6, 2, "#2f8f4a");
      r(x + 1, 226 - h, 1, h, "#5ac878");
    });
    const tx = mod(W - t * 0.09, W + 60) - 30;
    const ty = 214 - Math.abs(Math.sin(t / 260)) * 14;
    c.strokeStyle = "#7a5a2a";
    c.lineWidth = 1;
    c.beginPath();
    c.arc(tx, ty, 6, 0, 6.28);
    c.stroke();
    c.beginPath();
    c.arc(tx, ty, 3, t / 200, t / 200 + 4);
    c.stroke();
    const bo = (t * 150) / 1000;
    for (let k = -1; k * 140 < w + 140; k++) {
      const x = Math.round(k * 140 - mod(bo, 140));
      r(x, 120, 6, 116, "#4a2f1a");
      r(x + 1, 120, 2, 116, "#6a4a2a");
      line(x + 6, 130, x + 134, 222, "#3a2412", 3);
      line(x + 134, 130, x + 6, 222, "#3a2412", 3);
      r(x, 118, 140, 6, "#5a3a1f");
      r(x, 118, 140, 1, "#7a5a33");
    }
    smoke(t, 7, "#d9c9c0");
    wind(t, 10, "#ffe9c0", 500);
    // two gangs ride alongside for a while: gunfights, leaps between horses and lassos
    gangs(t);
    // a tunnel every so often: a cliff block with the dark inside showing along its side
    tunnel(t);
  }
  ctx.restore();
  // The roof's far edge: a railing, then a strip of roof with vents.
  const f = FAR[scene];
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, topY, w, 92 - topY);
  ctx.clip();
  c = ctx;
  for (let x = 10; x < w; x += 26) {
    r(x, 62, 2, 16, DK);
    r(x + 1, 63, 1, 14, f.rail);
  }
  r(0, 62, w, 2, DK);
  r(0, 63, w, 1, f.rail);
  r(0, 76, w, 16, f.far);
  r(0, 76, w, 2, DK);
  r(0, 78, w, 1, f.hi);
  for (let vx = 90; vx < w; vx += 210) {
    r(vx, 81, 26, 9, DK);
    r(vx + 1, 82, 24, 7, f.vent);
    for (let i = 0; i < 5; i++) r(vx + 4 + i * 4, 83, 2, 4, DK);
  }
  if (scene === "canyon" && tunSpan) {
    ctx.globalAlpha = 0.7;
    r(tunSpan[0], 76, Math.max(0, tunSpan[1] - tunSpan[0]), 16, "#06040a");
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}
