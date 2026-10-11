// Street style: graffiti on the wall and the fence, and a guy with a spray can who keeps painting. Three scenes take turns.
// The drawing code works in the little 260-wide picture it was designed in (y = game y + 20); draw() places it in the game.

const GLYPHS: Record<string, string> = {
  A: "010101111101101", B: "110101110101110", C: "111100100100111", D: "110101101101110", E: "111100110100111", F: "111100110100100",
  G: "111100101101111", H: "101101111101101", I: "111010010010111", J: "001001001101111", K: "101101110101101", L: "100100100100111",
  M: "101111111101101", N: "110101101101101", O: "111101101101111", P: "111101111100100", Q: "111101101111001", R: "110101110101101",
  S: "111100111001111", T: "111010010010010", U: "101101101101111", V: "101101101101010", W: "101101111111101", X: "101101010101101",
  Y: "101101010010010", Z: "111001010100111", "0": "111101101101111", "1": "010110010010111", "2": "111001111100111",
  "3": "111001111001111", "4": "101101111001001", "5": "111100111001111", "6": "111100111101111", "7": "111001010010010",
  "8": "111101111101111", "9": "111101111001111", " ": "000000000000000",
};

const PAL = ["#ff4fa0", "#35d4ff", "#ffe14a", "#5de06a", "#ff8a1f", "#9b5cff"];
const DK = "#1c1c22";
const OY = 20;
const FLOOR = 112;
const TILE = 260;
const SCENES = [10000, 14000, 12000, 15000, 15000];
/** The abseiler needs a tall wall: this many art pixels between the top and the fence. */
const ROPE_MIN_WALL = 130;

const STAR = ["0001000", "0001000", "0011100", "1111111", "0111110", "0110110", "0100010"];
const BOLT = ["0001100", "0011000", "0110000", "1111110", "0001100", "0011000", "0110000", "0100000"];
const HEART = ["0110110", "1111111", "1111111", "0111110", "0011100", "0001000"];
const CROWN = ["1001001", "1101011", "1111111", "1111111"];
const SHIRT = ["#3a3a44", "#4a4a58"];

let x: CanvasRenderingContext2D;

function hs(a: number, b: number): number {
  let n = (a * 374761393 + b * 668265263) | 0;
  n = (n ^ (n >>> 13)) * 1274126177;
  return (((n ^ (n >>> 16)) >>> 0) % 1000) / 1000;
}

function r(a: number, b: number, w: number, h: number, col: string): void {
  x.fillStyle = col;
  x.fillRect(Math.round(a), Math.round(b), w, h);
}

const ease = (u: number): number => (u < 0 ? 0 : u > 1 ? 1 : u * u * (3 - 2 * u));

function line(x1: number, y1: number, x2: number, y2: number, col: string, th = 1): void {
  const n = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) || 1;
  for (let i = 0; i <= n; i++) r(x1 + ((x2 - x1) * i) / n, y1 + ((y2 - y1) * i) / n, th, th, col);
}

function drawPix(rows: string[], x0: number, y0: number, col: string, sc = 1): void {
  rows.forEach((row, j) => [...row].forEach((c, i) => c === "1" && r(x0 + i * sc, y0 + j * sc, sc, sc, col)));
}

function disc(cx: number, cy: number, R: number, col: string, edge?: string): void {
  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      const d = dx * dx + dy * dy;
      if (d <= R * R + 1) r(cx + dx, cy + dy, 1, 1, edge && d > (R - 1) * (R - 1) + 1 ? edge : col);
    }
  }
}

function glyphPixels(str: string, sc: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  let px = 0;
  for (const ch of str) {
    const g = GLYPHS[ch] ?? GLYPHS[" "];
    for (let k = 0; k < 15; k++) {
      if (g[k] === "1") for (let a = 0; a < sc; a++) for (let b = 0; b < sc; b++) out.push([px + (k % 3) * sc + a, Math.floor(k / 3) * sc + b, px]);
    }
    px += 4 * sc;
  }
  return out;
}

/** Bubble letters with outline, shadow and optional drips. reveal = how far from the left the paint has got. */
function bubble(str: string, x0: number, y0: number, sc: number, cols: string[], reveal: number, outline: string, shadow: string, drip: number): void {
  const px = glyphPixels(str, sc);
  const set = new Set(px.map((p) => p[0] + "," + p[1]));
  const vis = px.filter((p) => p[0] <= reveal);
  for (const [a, b] of vis) r(x0 + a + 1, y0 + b + 2, 1, 1, shadow);
  for (const [a, b] of vis) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) if (!set.has(a + dx + "," + (b + dy)) && (dx || dy)) r(x0 + a + dx, y0 + b + dy, 1, 1, outline);
    }
  }
  for (const [a, b, gx] of vis) {
    r(x0 + a, y0 + b, 1, 1, cols[Math.floor(gx / (4 * sc)) % cols.length]);
    if (b % sc === 0 && a % sc === 0) r(x0 + a, y0 + b, 1, 1, "#ffffffcc");
  }
  if (drip > 0) {
    for (const [a, b, gx] of vis) {
      if (set.has(a + "," + (b + 1)) || hs(a, 7) >= 0.18) continue;
      const len = Math.min(2 + Math.floor(hs(a, 3) * 7), Math.floor(drip * 9));
      r(x0 + a, y0 + b + 1, 1, len, cols[Math.floor(gx / (4 * sc)) % cols.length]);
    }
  }
}

interface Pose {
  walk?: boolean;
  tx?: number;
  ty?: number;
  spray?: boolean;
  col?: string;
  rattle?: boolean;
  face?: number;
}

/** The guy with the can: cap, hoodie, backpack. base = the y of his feet. */
function guy(gx: number, base: number, t: number, o: Pose): void {
  const f = o.face ?? 1;
  const step = Math.floor(t / 110) % 2;
  const bob = o.walk ? step : 0;
  const l1 = o.walk ? (step ? 2 : -1) : 0;
  r(gx - 2 + l1, base - 6, 2, 5, "#2a3a6a");
  r(gx + 1 - l1, base - 6, 2, 5, "#2a3a6a");
  r(gx - 3 + l1, base - 1, 3, 1, "#f4f6fb");
  r(gx + 1 - l1, base - 1, 3, 1, "#f4f6fb");
  r(gx - (f > 0 ? 5 : -3), base - 11 - bob, 2, 5, "#e8731f");
  r(gx - 3, base - 12 - bob, 6, 7, SHIRT[0]);
  r(gx - 3, base - 12 - bob, 6, 1, SHIRT[1]);
  r(gx - 2, base - 16 - bob, 4, 4, "#f2c9a0");
  r(gx - 2, base - 17 - bob, 4, 2, "#e8392b");
  r(gx + (f > 0 ? 2 : -4), base - 16 - bob, 2, 1, "#e8392b");
  r(gx + (f > 0 ? 1 : -1), base - 15 - bob, 1, 1, DK);
  const sx = gx + (f > 0 ? 2 : -2);
  const sy = base - 11 - bob;
  let hx = gx + f * 4;
  let hy = base - 9 - bob + (o.walk ? 1 : 0);
  if (o.tx !== undefined && o.ty !== undefined) {
    const dx = o.tx - sx;
    const dy = o.ty - sy;
    const d = Math.hypot(dx, dy) || 1;
    const len = Math.min(7, d);
    hx = sx + (dx / d) * len;
    hy = sy + (dy / d) * len;
  }
  if (o.rattle) {
    hx += Math.sin(t / 25) * 1.5;
    hy += Math.cos(t / 30) * 1.5;
  }
  line(sx, sy, hx, hy, SHIRT[0]);
  r(hx, hy, 1, 1, "#f2c9a0");
  const col = o.col ?? PAL[0];
  const cx = Math.round(hx) + (f > 0 ? 0 : -2);
  const cy = Math.round(hy) - 3;
  r(cx, cy, 2, 4, col);
  r(cx, cy, 2, 1, "#9aa1ad");
  r(cx + (f > 0 ? 1 : 0), cy - 1, 1, 1, "#dde1e8");
  if (o.spray && o.tx !== undefined && o.ty !== undefined) {
    const nx = cx + (f > 0 ? 2 : 0);
    const ny = cy - 1;
    const sl = Math.floor(t / 40);
    for (let k = 0; k < 14; k++) {
      const u = ((t / 45 + k * 1.7) % 7) / 7;
      const sp = u * 3;
      r(nx + (o.tx - nx) * u + (hs(k, sl) - 0.5) * sp * 2, ny + (o.ty - ny) * u + (hs(k + 9, sl) - 0.5) * sp * 2, 1, 1, k % 3 ? col : "#ffffffaa");
    }
    for (let k = 0; k < 8; k++) r(o.tx + (hs(k, Math.floor(t / 60)) - 0.5) * 9, o.ty + (hs(k + 4, Math.floor(t / 60)) - 0.5) * 7, 1, 1, col + "88");
  }
}

// ---- scene 0: tagging a name ------------------------------------------------


function frontA(t: number, lt: number, alpha: number): void {
  const T = SCENES[0];
  const p = lt / T;
  const sc = 4;
  const x0 = 92;
  const y0 = 72;
  const wd = 5 * 4 * sc - sc;
  const reveal = p < 0.55 ? ease(p / 0.55) * wd : wd;
  x.globalAlpha = alpha * (p > 0.93 ? 1 - (p - 0.93) / 0.07 : 1);
  bubble("HOOPS", x0, y0, sc, PAL.slice(0, 5), reveal, "#ffffff", DK, Math.max(0, Math.min(1, (p - 0.55) / 0.3)));
  x.globalAlpha = alpha;
  if (p < 0.55) {
    const li = Math.min(4, Math.floor(reveal / (4 * sc)));
    guy(x0 + reveal - 18, FLOOR, t, { walk: p > 0.01 && p < 0.54, tx: x0 + reveal + 2, ty: y0 + 8 + Math.sin(t / 180) * 5, spray: true, col: PAL[li], face: 1 });
  } else {
    guy(x0 + wd - 18, FLOOR, t, { col: PAL[4], face: 1, rattle: p > 0.86 && p < 0.93 });
  }
}

// ---- the wall: the same all the time, built up in layers like a real graffiti wall -----

/** Marker tag: a scribble across w x h, with a shadow, an underline and a dot. */
function tag(x0: number, y0: number, w: number, h: number, col: string, seed: number, th = 1): void {
  const n = 8;
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) pts.push([x0 + (i * w) / (n - 1), y0 + (i % 2 ? h : 0) + (hs(seed, i) - 0.5) * h * 0.8]);
  for (const sh of [1, 0]) {
    for (let i = 0; i < n - 1; i++) line(pts[i][0] + sh, pts[i][1] + sh, pts[i + 1][0] + sh, pts[i + 1][1] + sh, sh ? "#1c1c2288" : col, th);
  }
  line(x0, y0 + h + 3, x0 + w * 0.8, y0 + h + 2, col, 1);
  r(x0 + w + 2, y0 - 2, 2, 2, col);
}

function sticker(x0: number, y0: number, kind: number, col: string): void {
  r(x0 - 1, y0 - 1, 10, 8, "#f4f6fb");
  r(x0, y0, 8, 6, col);
  if (kind === 0) {
    r(x0 + 2, y0 + 1, 1, 1, DK);
    r(x0 + 5, y0 + 1, 1, 1, DK);
    r(x0 + 2, y0 + 4, 4, 1, DK);
  } else if (kind === 1) {
    r(x0 + 3, y0 + 1, 2, 4, "#fff");
    r(x0 + 1, y0 + 2, 6, 1, "#fff");
  } else disc(x0 + 4, y0 + 3, 2, "#ff8a1f");
}

/** Old pieces painted over with roller paint. */
function buff(x0: number, y0: number, w: number, h: number, col: string, seed: number): void {
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const edge = i < 2 || j < 2 || i > w - 3 || j > h - 3;
      if (edge && hs(i + seed, j) < 0.4) continue;
      r(x0 + i, y0 + j, 1, 1, col);
    }
  }
  for (let i = 6; i < w; i += 9) r(x0 + i, y0 + 2, 1, h - 4, "#00000022");
  for (let j = 5; j < h; j += 8) r(x0 + 3, y0 + j, w - 6, 1, "#ffffff12");
}

/** A torn wheat-paste poster. */
function poster(x0: number, y0: number, w: number, h: number): void {
  r(x0, y0, w, h, "#e8e0cc");
  for (let i = 0; i < w; i += 3) if (hs(i, x0) < 0.5) r(x0 + i, y0 + h - 1, 2, 1, "#8a4a3a");
  r(x0 + 2, y0 + 2, w - 4, 6, "#e8392b");
  r(x0 + 3, y0 + 3, w - 6, 1, "#fff");
  disc(x0 + w / 2, y0 + h / 2 + 2, 5, DK);
  r(x0 + w / 2 - 2, y0 + h / 2, 2, 2, "#e8e0cc");
  r(x0 + w / 2 + 1, y0 + h / 2, 2, 2, "#e8e0cc");
  r(x0 + 2, y0 + h - 7, w - 4, 1, DK);
  r(x0 + 2, y0 + h - 5, w - 8, 1, DK);
  for (let k = 0; k < 4; k++) r(x0 + w - k - 1, y0 + h - k - 1, k + 1, 1, "#c9c2ae");
}

const WORDS = ["BOLT", "KID", "SAD", "OK", "ACE", "JAM", "DUNK", "HOOP", "NET", "RIM", "SWISH", "FLY", "ZONE", "MVP", "CREW", "KING", "ROCK", "TAG", "WOW", "GAME", "SKY", "FIRE", "COOL", "JUMP", "WIN", "RAW", "LUCK", "BEAST", "HYPE", "SLAM"];
const PALS = [["#ff4fa0", "#ffe14a"], ["#35d4ff", "#9b5cff"], ["#5de06a", "#ffe14a"], ["#ff8a1f", "#ffe14a"], ["#c9ced8", "#c9ced8"], ["#ffffff", "#35d4ff"], ["#9b5cff", "#ff4fa0"], ["#ffe14a", "#ff8a1f"], ["#35d4ff", "#5de06a"]];
const BUFFS = ["#8b6b5e", "#6f7a86", "#a89478", "#7f8f7a"];
const TAGCOLS = ["#ffffff", "#ff8a1f", "#ffe14a", "#35d4ff", "#ff4fa0", "#5de06a"];
const STICKCOLS = ["#ffe14a", "#e8392b", "#3a5493", "#5de06a", "#ff4fa0"];

function pick<T>(a: T[], s1: number, s2: number): T {
  return a[Math.floor(hs(s1, s2) * a.length)];
}

const wordW = (s: string, sc: number): number => s.length * 4 * sc - sc;

/** Block letters with a 3D side. */
function block(str: string, x0: number, y0: number, sc: number, face: string, side: string, outline: string, depth: number): void {
  const P = glyphPixels(str, sc);
  const set = new Set(P.map((p) => p[0] + "," + p[1]));
  for (let d = depth; d >= 1; d--) for (const [a, b] of P) r(x0 + a + d, y0 + b + d, 1, 1, side);
  for (const [a, b] of P) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) if (!set.has(a + dx + "," + (b + dy)) && (dx || dy)) r(x0 + a + dx, y0 + b + dy, 1, 1, outline);
    }
  }
  for (const [a, b] of P) r(x0 + a, y0 + b, 1, 1, face);
  for (const [a, b] of P) if (!set.has(a - 1 + "," + b) || !set.has(a + "," + (b - 1))) r(x0 + a, y0 + b, 1, 1, "#ffffff");
}

const CELL_W = 62;
const CELL_H = 44;

/** The kind of piece in a cell; never the same as the one to the left or above. */
function cellType(i: number, j: number): number {
  let t = Math.floor(hs(i * 7 + 1, j * 13 + 5) * 10);
  const left = i > 0 ? cellType(i - 1, j) : -1;
  const up = j > 0 ? cellType(i, j - 1) : -1;
  for (let n = 0; n < 10 && (t === left || t === up); n++) t = (t + 1) % 10;
  return t;
}

/** One cell of the wall: a piece (or nothing) placed with a little jitter. Every cell is different and a lot of them are empty. */
function cell(i: number, j: number, fenceY: number): void {
  const oy0 = fenceY - (j + 1) * CELL_H;
  if (hs(i * 3 + 2, j * 5 + 1) < 0.14) {
    buff(i * CELL_W + 8 + hs(i, j) * 20, oy0 + 6 + hs(j, i) * 10, 34 + Math.floor(hs(i, j + 3) * 34), 24 + Math.floor(hs(j, i + 4) * 24), pick(BUFFS, i, j), i * 9 + j);
  }
  if (hs(i * 11 + 7, j * 3 + 9) < 0.5) return;
  const t = cellType(i, j);
  const ox = i * CELL_W + 4 + (hs(i, j + 9) - 0.5) * 14;
  const oy = oy0 + 4 + (hs(j, i + 9) - 0.5) * 8;
  const sd = i * 31 + j * 17;
  const pal = pick(PALS, i + 11, j + 3);
  const word = pick(WORDS, i + 5, j + 9);
  if (t <= 2) {
    const sc = word.length > 3 ? 3 : 4;
    bubble(word, ox + (CELL_W - wordW(word, sc)) / 2, oy + 4, sc, pal, 99, DK, "#00000066", 1);
  } else if (t === 3) {
    const wd = pick(["OK", "ACE", "JAM", "WOW"], i, j);
    bubble(wd, ox + (CELL_W - wordW(wd, 5)) / 2, oy + 2, 5, [pal[0]], 99, "#ffffff", DK, 1);
  } else if (t <= 5) {
    tag(ox + 4, oy + 10, 38 + hs(i, j + 1) * 14, 6, pick(TAGCOLS, i, j + 2), sd, hs(i, j) > 0.6 ? 2 : 1);
  } else if (t === 6) {
    const k = Math.floor(hs(i, j + 6) * 4);
    if (k === 0) drawPix(CROWN, ox + 20, oy + 10, "#ffe14a", 3);
    else if (k === 1) drawPix(STAR, ox + 20, oy + 8, "#ffe14a", 3);
    else if (k === 2) drawPix(BOLT, ox + 22, oy + 6, "#9b5cff", 3);
    else drawPix(HEART, ox + 20, oy + 10, "#ff4fa0", 3);
  } else if (t === 7) {
    sticker(ox + 6, oy + 8, Math.floor(hs(i, j + 1) * 3), pick(STICKCOLS, i, j));
    sticker(ox + 26, oy + 18, Math.floor(hs(i, j + 2) * 3), pick(STICKCOLS, i + 1, j));
    sticker(ox + 42, oy + 6, Math.floor(hs(i, j + 3) * 3), "#9b5cff");
  } else if (t === 8) {
    poster(ox + 18, oy + 2, 22, 32);
  } else {
    const w3 = word.slice(0, 3);
    block(w3, ox + (CELL_W - wordW(w3, 3)) / 2 - 3, oy + 6, 3, pal[0], "#2a2f4a", DK, 3);
  }
}

// ---- scene 1: a wall full of art, a new piece on top -------------------------


function fenceB(): void {
  bubble("HOOPS", 24, 80, 2, ["#ff4fa0", "#ffe14a", "#5de06a", "#35d4ff", "#ff8a1f"], 99, DK, "#00000066", 1);
  bubble("MVP", 196, 82, 2, ["#ffe14a", "#ff4fa0"], 99, "#ffffff", DK, 0);
  drawPix(HEART, 110, 86, "#ff4fa0", 2);
}

function frontB(t: number, lt: number): void {
  const spots: [number, number, string[], string][] = [[150, 84, STAR, "#ffe14a"], [56, 84, BOLT, "#35d4ff"]];
  const phase = lt < 7000 ? 0 : 1;
  const l = lt % 7000;
  const s = spots[phase];
  const walkIn = ease(l / 1800);
  const gx0 = phase ? -20 : TILE + 20;
  const gxTarget = s[0] + (phase ? -12 : 20);
  const doSpray = l >= 2600 && l < 5000;
  const frac = l >= 5000 ? 1 : doSpray ? (l - 2600) / 2400 : 0;
  const pts: [number, number][] = [];
  s[2].forEach((row, j) => [...row].forEach((c, i) => c === "1" && pts.push([i, j])));
  pts.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const n = Math.floor(pts.length * frac);
  for (let k = 0; k < n; k++) {
    const [i, j] = pts[k];
    r(s[0] + i * 2, s[1] + j * 2, 2, 2, s[3]);
    if (i === 0 || k % 5 === 0) r(s[0] + i * 2, s[1] + j * 2, 1, 1, "#ffffffaa");
  }
  if (l >= 5000) for (const [i, j] of pts) if (hs(i * 7 + j, phase) < 0.15) r(s[0] + i * 2, s[1] + j * 2 + 2, 1, 2 + Math.floor(hs(i, j) * 4), s[3]);
  const last = pts[Math.max(0, n - 1)];
  const o: Pose = { walk: walkIn < 1 || l > 6000, face: walkIn < 1 ? (phase ? 1 : -1) : l > 6000 ? (phase ? -1 : 1) : phase ? 1 : -1, col: s[3] };
  if (l >= 1800 && l < 6000) {
    o.tx = s[0] + last[0] * 2;
    o.ty = s[1] + last[1] * 2;
    o.spray = doSpray;
    o.rattle = l < 2600;
    o.walk = false;
    o.face = phase ? 1 : -1;
  }
  const gx = l > 6000 ? gxTarget + (phase ? 1 : -1) * ((l - 6000) / 1000) * 10 : gx0 + (gxTarget - gx0) * walkIn;
  guy(gx, FLOOR, t, o);
}

// ---- scene 2: a mural from a rolling scaffold -------------------------------


function frontC(t: number, lt: number, alpha: number): void {
  const gp = lt / SCENES[2];
  const mx = 130;
  const my = 60;
  const px: [number, number, string][] = [];
  for (let dy = -11; dy <= 11; dy++) {
    for (let dx = -11; dx <= 11; dx++) {
      const d = dx * dx + dy * dy;
      if (d <= 122) px.push([dx, dy, d > 91.4 ? "edge" : "fill"]);
    }
  }
  for (const sg of [1, -1]) {
    for (let k = 0; k < 4; k++) {
      for (let i = 0; i < 22 - k * 4; i++) for (let j = 0; j < 3; j++) px.push([sg * (11 + i), -6 + k * 4 + j - Math.floor(i * 0.25), "wing" + k]);
    }
  }
  const stageU = gp < 0.2 ? gp / 0.2 : gp < 0.4 ? (gp - 0.2) / 0.2 : gp < 0.5 ? (gp - 0.4) / 0.1 : gp < 0.75 ? (gp - 0.5) / 0.25 : 1;
  const rv = mx - 33 + stageU * 66;
  x.globalAlpha = alpha * (gp > 0.95 ? 1 - (gp - 0.95) / 0.05 : 1);
  const wingCols = ["#ffffff", "#bfeaff", "#7fd0ff", "#35d4ff"];
  for (const [dx, dy, k] of px) {
    const X = mx + dx;
    const Y = my + dy;
    const wing = k.startsWith("wing");
    if (gp < 0.2) {
      if (k === "edge" && X <= rv) r(X, Y, 1, 1, "#ffffff");
      if (wing && X <= rv && (dy % 3 === 0 || Math.abs(dx) > 28)) r(X, Y, 1, 1, "#ffffff66");
    } else {
      if (k === "edge") r(X, Y, 1, 1, DK);
      if (k === "fill") r(X, Y, 1, 1, gp >= 0.4 || X <= rv ? "#ff8a1f" : "#ffffff");
      if (wing && gp >= 0.5 && (X <= rv || gp >= 0.75)) r(X, Y, 1, 1, wingCols[Number(k[4])]);
      if (wing && gp >= 0.2 && gp < 0.5) r(X, Y, 1, 1, "#ffffff33");
    }
  }
  if (gp >= 0.4) {
    const u = gp < 0.5 ? (gp - 0.4) / 0.1 : 1;
    const rx = mx - 12 + u * 24;
    for (let i = -11; i <= 11; i++) if (mx + i <= rx) r(mx + i, my, 1, 1, "#7a3a10");
    if (rx >= mx) for (let j = -11; j <= 11; j++) r(mx, my + j, 1, 1, "#7a3a10");
    for (let a = -6; a <= 6; a++) {
      const yy = Math.round(Math.sqrt(Math.max(0, 121 - a * a) * 0.45));
      if (mx + a <= rx) {
        r(mx + a, my - yy + 4, 1, 1, "#7a3a10");
        r(mx + a, my + yy - 4, 1, 1, "#7a3a10");
      }
    }
  }
  if (gp >= 0.75) {
    r(mx - 7, my - 8, 3, 3, "#ffffff");
    r(mx - 6, my - 7, 1, 1, "#ffe9b0");
    if ((gp - 0.75) / 0.13 > 0.3) {
      for (let k = 0; k < 8; k++) {
        const sx = mx - 26 + Math.floor(hs(k, 2) * 52);
        const sy = my - 16 + Math.floor(hs(k, 5) * 30);
        if (Math.floor(t / 120 + k * 3) % 5 < 2) {
          r(sx, sy, 1, 1, "#fff");
          r(sx - 1, sy, 3, 1, "#fff6a0");
          r(sx, sy - 1, 1, 3, "#fff6a0");
        }
      }
    }
  }
  if (gp >= 0.88) {
    const u = Math.min(1, (gp - 0.88) / 0.07);
    [..."KID"].forEach((ch, i) => {
      const g = GLYPHS[ch];
      if (i * 5 <= u * 15) for (let k = 0; k < 15; k++) if (g[k] === "1") r(mx + 22 + i * 5 + (k % 3), my + 16 + Math.floor(k / 3), 1, 1, "#ffe14a");
    });
  }
  x.globalAlpha = alpha;
  let tx = mx - 30 + stageU * 60;
  let ty = my + Math.sin(t / 200) * 4;
  if (gp >= 0.75) {
    tx = mx - 8 + Math.sin(t / 200) * 3;
    ty = my - 6;
  }
  if (gp >= 0.88) {
    tx = mx + 24 + ((gp - 0.88) / 0.07) * 10;
    ty = my + 17;
  }
  if (gp >= 0.95) tx = mx - 40;
  const gx = Math.max(20, Math.min(TILE - 20, tx - 14));
  for (let k = 0; k < 3; k++) {
    const cy = FLOOR - (k + 1) * 8;
    r(gx - 9, cy, 18, 8, "#a8743c");
    r(gx - 9, cy, 18, 1, "#c99456");
    r(gx - 9, cy + 7, 18, 1, "#6b4423");
    r(gx - 9, cy, 1, 8, "#6b4423");
    r(gx + 8, cy, 1, 8, "#6b4423");
    line(gx - 8, cy + 1, gx + 7, cy + 7, "#7a4a22");
  }
  r(gx - 8, FLOOR, 3, 2, DK);
  r(gx + 5, FLOOR, 3, 2, DK);
  const col = gp < 0.2 ? "#ffffff" : gp < 0.4 ? "#ff8a1f" : gp < 0.5 ? DK : gp < 0.75 ? "#35d4ff" : gp < 0.88 ? "#ffffff" : "#ffe14a";
  guy(gx, FLOOR - 24, t, { tx, ty, spray: gp < 0.95, col, face: 1, rattle: gp >= 0.95 });
}

// ---- scene 3: the abseiler -----------------------------------------------

/** The guy hanging in a harness from a rope tied at (ax, top). (gx, gy) = his waist. */
function ropeGuy(ax: number, top: number, gx: number, gy: number, t: number, o: Pose & { kick?: number }): void {
  line(ax, top, gx, gy - 8, "#d8d2c0");
  line(ax + 1, top, gx + 1, gy - 8, "#8a8470");
  const kick = o.kick ?? 0;
  line(gx - 1, gy - 5, gx - 3 - kick, gy, "#2a3a6a", 2);
  line(gx + 1, gy - 5, gx + 3 + kick * 0.4, gy - 1, "#2a3a6a", 2);
  r(gx - 5 - kick, gy, 3, 1, "#f4f6fb");
  r(gx + 3 + kick * 0.4, gy - 1, 3, 1, "#f4f6fb");
  r(gx - 3, gy - 6, 6, 1, "#ffe14a");
  r(gx - 1, gy - 7, 2, 3, "#ffe14a");
  line(gx, gy - 8, gx, gy - 9, "#9aa1ad");
  r(gx - 3, gy - 13, 6, 7, SHIRT[0]);
  r(gx - 3, gy - 13, 6, 1, SHIRT[1]);
  r(gx - 2, gy - 17, 4, 4, "#f2c9a0");
  r(gx - 2, gy - 18, 4, 2, "#e8392b");
  r(gx + 2, gy - 17, 2, 1, "#e8392b");
  r(gx - 1, gy - 16, 1, 1, DK);
  r(gx + 1, gy - 16, 1, 1, DK);
  line(gx - 2, gy - 12, gx - 3, gy - 19, SHIRT[0]);
  r(gx - 3, gy - 19, 1, 1, "#f2c9a0");
  const sx = gx + 2;
  const sy = gy - 12;
  let hx = gx + 5;
  let hy = gy - 9;
  if (o.tx !== undefined && o.ty !== undefined) {
    const dx = o.tx - sx;
    const dy = o.ty - sy;
    const d = Math.hypot(dx, dy) || 1;
    const len = Math.min(7, d);
    hx = sx + (dx / d) * len;
    hy = sy + (dy / d) * len;
  }
  if (o.rattle) {
    hx += Math.sin(t / 25) * 1.5;
    hy += Math.cos(t / 30) * 1.5;
  }
  line(sx, sy, hx, hy, SHIRT[0]);
  r(hx, hy, 1, 1, "#f2c9a0");
  const col = o.col ?? PAL[0];
  const cx = Math.round(hx);
  const cy = Math.round(hy) - 3;
  r(cx, cy, 2, 4, col);
  r(cx, cy, 2, 1, "#9aa1ad");
  r(cx + 1, cy - 1, 1, 1, "#dde1e8");
  if (o.spray && o.tx !== undefined && o.ty !== undefined) {
    const nx = hx + 2;
    const ny = hy - 4;
    const sl = Math.floor(t / 40);
    for (let k = 0; k < 14; k++) {
      const u = ((t / 45 + k * 1.7) % 7) / 7;
      const sp = u * 3;
      r(nx + (o.tx - nx) * u + (hs(k, sl) - 0.5) * sp * 2, ny + (o.ty - ny) * u + (hs(k + 9, sl) - 0.5) * sp * 2, 1, 1, k % 3 ? col : "#ffffffaa");
    }
    for (let k = 0; k < 8; k++) r(o.tx + (hs(k, Math.floor(t / 60)) - 0.5) * 9, o.ty + (hs(k + 4, Math.floor(t / 60)) - 0.5) * 7, 1, 1, col + "88");
  }
}

/** He abseils down, bobs and swings along the wall and sprays a huge GO HOOPS, then is hauled back up. */
function frontRope(t: number, lt: number, alpha: number, w: number, topY: number): void {
  const p = lt / SCENES[3];
  const sc = 7;
  const word = "GO HOOPS";
  const wd = word.length * 4 * sc - sc;
  const x00 = Math.round((w - wd) / 2);
  const y0 = Math.round(topY + (45 - topY) * 0.29);
  const down = ease(p / 0.1);
  const paint = p > 0.1 && p < 0.74;
  const up = ease((p - 0.8) / 0.14);
  const reveal = p < 0.1 ? 0 : p < 0.74 ? ((p - 0.1) / 0.64) * wd : wd;
  x.globalAlpha = alpha * (p > 0.94 ? 1 - (p - 0.94) / 0.06 : 1);
  bubble(word, x00, y0, sc, PAL, reveal, "#ffffff", DK, p > 0.74 ? 1 : 0);
  x.globalAlpha = alpha;
  const front = x00 + reveal;
  let gx = paint ? front - 20 + Math.sin(t / 300) * 7 : p < 0.1 ? x00 - 24 : front - 20;
  if (p >= 0.74) gx = x00 + wd - 20;
  const rest = topY - 24;
  const target = y0 + 36;
  const bob = Math.sin(t / 170) * 4 + Math.sin(t / 410) * 2;
  const gy = p < 0.1 ? rest + down * (target - rest) : p < 0.8 ? target + bob : target + (rest - target) * up;
  ropeGuy(Math.max(30, Math.min(w - 30, gx + 10)), topY, gx, gy, t, {
    tx: front + 2,
    ty: y0 + 18 + Math.sin(t / 160) * 10,
    spray: paint,
    col: PAL[Math.min(5, Math.floor(reveal / (4 * sc)))],
    kick: Math.max(0, Math.sin(t / 260)) * 3,
    rattle: p > 0.72 && p < 0.74,
  });
}

// ---- scene 4: the hanging chair --------------------------------------------

/** Block letters, painted down to maxY. */
function blockTo(str: string, x0: number, y0: number, sc: number, face: string, side: string, depth: number, maxY: number): void {
  const P0 = glyphPixels(str, sc);
  const set = new Set(P0.map((p) => p[0] + "," + p[1]));
  const P = P0.filter((p) => y0 + p[1] <= maxY);
  for (let d = depth; d >= 1; d--) for (const [a, b] of P) r(x0 + a + d, y0 + b + d, 1, 1, side);
  for (const [a, b] of P) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) if (!set.has(a + dx + "," + (b + dy)) && (dx || dy)) r(x0 + a + dx, y0 + b + dy, 1, 1, DK);
    }
  }
  for (const [a, b] of P) r(x0 + a, y0 + b, 1, 1, face);
  for (const [a, b] of P) if (!set.has(a - 1 + "," + b) || !set.has(a + "," + (b - 1))) r(x0 + a, y0 + b, 1, 1, "#ffffff");
}

/** The guy sitting on a plank hung from two ropes, with a paint roller. (gx, gy) = his waist. */
function chairGuy(top: number, gx: number, gy: number, tx: number, ty: number, col: string): void {
  for (const off of [-7, 7]) {
    line(gx + off, top, gx + off, gy + 4, "#d8d2c0");
    line(gx + off + 1, top, gx + off + 1, gy + 4, "#8a8470");
  }
  r(gx - 9, gy + 4, 18, 2, "#a8743c");
  r(gx - 9, gy + 4, 18, 1, "#c99456");
  r(gx - 4, gy - 1, 3, 3, "#2a3a6a");
  r(gx, gy - 1, 3, 3, "#2a3a6a");
  r(gx - 5, gy + 2, 3, 2, "#2a3a6a");
  r(gx + 1, gy + 2, 3, 2, "#2a3a6a");
  r(gx - 5, gy + 3, 3, 1, "#f4f6fb");
  r(gx + 1, gy + 3, 3, 1, "#f4f6fb");
  r(gx - 3, gy - 6, 6, 1, "#ffe14a");
  r(gx - 1, gy - 7, 2, 3, "#ffe14a");
  r(gx - 3, gy - 13, 6, 7, SHIRT[0]);
  r(gx - 3, gy - 13, 6, 1, SHIRT[1]);
  r(gx - 2, gy - 17, 4, 4, "#f2c9a0");
  r(gx - 2, gy - 18, 4, 2, "#e8392b");
  r(gx + 2, gy - 17, 2, 1, "#e8392b");
  r(gx - 1, gy - 16, 1, 1, DK);
  r(gx + 1, gy - 16, 1, 1, DK);
  line(gx - 2, gy - 12, gx - 3, gy - 19, SHIRT[0]);
  r(gx - 3, gy - 19, 1, 1, "#f2c9a0");
  const sx = gx + 2;
  const sy = gy - 12;
  const dx = tx - sx;
  const dy = ty - sy;
  const d = Math.hypot(dx, dy) || 1;
  const len = Math.min(7, d);
  const hx = sx + (dx / d) * len;
  const hy = sy + (dy / d) * len;
  line(sx, sy, hx, hy, SHIRT[0]);
  r(hx, hy, 1, 1, "#f2c9a0");
  r(hx, hy - 2, 1, 3, "#9aa1ad");
  r(hx - 3, hy - 4, 8, 3, col);
  r(hx - 3, hy - 4, 8, 1, "#ffffff66");
  // the bucket hanging beside him
  line(gx - 19, top, gx - 19, gy + 8, "#d8d2c0");
  r(gx - 23, gy + 8, 8, 7, "#6b7280");
  r(gx - 23, gy + 8, 8, 2, col);
  r(gx - 22, gy + 6, 6, 1, "#9aa1ad");
}

/** He is lowered on the plank and rolls a huge 3D HOOPS onto the wall from the top down, then is hauled back up. */
function frontChair(t: number, lt: number, alpha: number, w: number, topY: number): void {
  const p = lt / SCENES[4];
  const sc = 10;
  const wd = 5 * 4 * sc - sc;
  const x0 = Math.round((w - wd) / 2) - 5;
  const y0 = Math.round(topY + (45 - topY) * 0.27);
  const h = 58;
  const down = ease(p / 0.1);
  const up = ease((p - 0.8) / 0.14);
  const paintU = p < 0.1 ? 0 : p < 0.72 ? (p - 0.1) / 0.62 : 1;
  const yR = y0 + paintU * h;
  x.globalAlpha = alpha * (p > 0.95 ? 1 - (p - 0.95) / 0.05 : 1);
  blockTo("HOOPS", x0, y0, sc, "#ffe14a", "#c2410c", 7, p >= 0.72 ? 9999 : yR);
  if (p >= 0.76) {
    for (let k = 0; k < 7; k++) {
      const sx = x0 + Math.floor(hs(k, 2) * wd);
      const sy = y0 + Math.floor(hs(k, 5) * 50);
      if (Math.floor(t / 120 + k * 3) % 5 < 2) {
        r(sx, sy, 1, 1, "#fff");
        r(sx - 2, sy, 5, 1, "#fff6a0");
        r(sx, sy - 2, 1, 5, "#fff6a0");
      }
    }
  }
  if (p > 0.1 && p < 0.72) r(0, yR, w, 1, "#ffffff22");
  x.globalAlpha = alpha;
  const rest = topY - 30;
  const low = y0 + h + 46;
  const bob = Math.sin(t / 170) * 3 + Math.sin(t / 410) * 1.5;
  const gy = p < 0.1 ? rest + down * (y0 + 46 - rest) : p < 0.72 ? yR + 46 + bob : p < 0.8 ? low + bob : low + (rest - low) * up;
  const gx = w / 2 + Math.sin(t / 1100) * (p < 0.72 ? 70 : 20);
  chairGuy(topY, gx, gy, gx + 9, yR + Math.sin(t / 220) * 5, "#ffe14a");
}

// ---- placing the scenes in the game -----------------------------------------

function which(t: number, ropeOk: boolean): { scene: number; lt: number; alpha: number } {
  const list = ropeOk ? SCENES : SCENES.slice(0, 3);
  const total = list.reduce((a, b) => a + b, 0);
  let lt = t % total;
  let scene = 0;
  while (lt >= list[scene]) lt -= list[scene++];
  return { scene, lt, alpha: Math.min(1, lt / 600, (list[scene] - lt) / 600) };
}

/** The wall: always the same. A different piece in every cell of an even grid, many cells left bare, filling the whole wall whatever its size. */
export function drawGraffitiWall(c: CanvasRenderingContext2D, t: number, w: number, fill: boolean, topY: number): void {
  x = c;
  void t;
  void fill;
  const fenceY = 45;
  const rows = Math.ceil((fenceY - topY) / CELL_H);
  const cols = Math.ceil(w / CELL_W) + 1;
  c.save();
  c.beginPath();
  c.rect(0, topY, w, fenceY - topY);
  c.clip();
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) cell(i, j, fenceY);
  c.restore();
}

/** Paint on the fence and the guy with the can (draw after the fence). */
export function drawGraffitiFront(c: CanvasRenderingContext2D, t: number, w: number, topY: number): void {
  x = c;
  const { scene, lt, alpha } = which(t, 45 - topY >= ROPE_MIN_WALL);
  const base0 = Math.round(w / 2 - TILE / 2);
  c.save();
  c.globalAlpha = alpha;
  if (scene === 3 || scene === 4) {
    (scene === 3 ? frontRope : frontChair)(t, lt, alpha, w, topY);
    c.restore();
    return;
  }
  if (scene === 1) {
    for (let k = -3; k <= 3; k++) {
      const bx = base0 + k * TILE;
      if (k === 0 || bx > w || bx < -TILE) continue;
      c.save();
      c.translate(bx, -OY);
      fenceB();
      c.restore();
    }
  }
  c.translate(base0, -OY);
  if (scene === 0) frontA(t, lt, alpha);
  else if (scene === 1) {
    fenceB();
    frontB(t, lt);
  } else frontC(t, lt, alpha);
  c.restore();
}
