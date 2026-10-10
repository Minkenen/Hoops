// Street style: graffiti on the wall and the fence, and a guy with a spray can who keeps painting. Three scenes take turns.
// The drawing code works in the little 260-wide picture it was designed in (y = game y + 20); draw() places it in the game.

const GLYPHS: Record<string, string> = {
  "0": "111101101101111", "1": "010110010010111", "2": "111001111100111", "3": "111001111001111", "4": "101101111001001",
  A: "010101111101101", B: "110101110101110", C: "111100100100111", D: "110101101101110", E: "111100110100111", H: "101101111101101",
  I: "111010010010111", K: "101101110101101", L: "100100100100111", M: "101111111101101", O: "111101101101111", P: "111101111100100",
  R: "110101110101101", S: "111100111001111", V: "101101101101010", W: "101101111111101", " ": "000000000000000",
};

const PAL = ["#ff4fa0", "#35d4ff", "#ffe14a", "#5de06a", "#ff8a1f", "#9b5cff"];
const DK = "#1c1c22";
const OY = 20;
const FLOOR = 112;
const TILE = 260;
const SCENES = [10000, 14000, 12000];
const TOTAL = SCENES.reduce((a, b) => a + b, 0);

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

function line(x1: number, y1: number, x2: number, y2: number, col: string): void {
  const n = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) || 1;
  for (let i = 0; i <= n; i++) r(x1 + ((x2 - x1) * i) / n, y1 + ((y2 - y1) * i) / n, 1, 1, col);
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

function wallA(): void {
  bubble("OK", 30, 46, 3, ["#35d4ff", "#ff4fa0"], 99, "#ffffff", DK, 0);
  drawPix(CROWN, 176, 48, "#ffe14a", 2);
  r(176, 60, 14, 2, "#c9a000");
  disc(228, 54, 8, "#ffe14a", "#c9a000");
  r(225, 51, 2, 2, DK);
  r(230, 51, 2, 2, DK);
  r(224, 57, 8, 1, DK);
  r(225, 58, 6, 1, DK);
  for (let i = 0; i < 5; i++) r(110, 46 + i * 3, 40, 2, PAL[i]);
}

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

// ---- scene 1: a wall full of art, a new piece on top -------------------------

function wallB(): void {
  bubble("BALL", 18, 46, 3, ["#35d4ff", "#9b5cff"], 99, "#ffffff", DK, 1);
  drawPix(CROWN, 112, 50, "#ffe14a", 2);
  r(112, 62, 14, 2, "#c9a000");
  disc(170, 56, 8, "#ffe14a", "#c9a000");
  r(167, 53, 2, 2, DK);
  r(172, 53, 2, 2, DK);
  r(166, 59, 9, 1, DK);
  r(167, 60, 7, 1, DK);
  disc(218, 54, 9, "#ff8a1f", "#7a3a10");
  r(209, 54, 18, 1, "#7a3a10");
  r(218, 45, 1, 18, "#7a3a10");
  drawPix(BOLT, 66, 46, "#9b5cff", 2);
  for (let i = 0; i < 6; i++) r(235, 46 + i * 3, 18, 2, PAL[i]);
}

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

function wallC(): void {
  bubble("CREW", 20, 46, 3, ["#ff4fa0", "#ffe14a"], 99, "#ffffff", DK, 0);
  drawPix(STAR, 226, 46, "#ffe14a", 2);
  for (let i = 0; i < 5; i++) r(90, 50 + i * 3, 30, 2, PAL[i]);
}

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

// ---- placing the scenes in the game -----------------------------------------

function which(t: number): { scene: number; lt: number; alpha: number } {
  let lt = t % TOTAL;
  let scene = 0;
  while (lt >= SCENES[scene]) lt -= SCENES[scene++];
  const T = SCENES[scene];
  return { scene, lt, alpha: Math.min(1, lt / 600, (T - lt) / 600) };
}

/** Pieces on the brick wall (draw before the fans and the fence). local y = the street's own coordinates. fill = the wall goes all the way up. */
export function drawGraffitiWall(c: CanvasRenderingContext2D, t: number, w: number, fill: boolean, topY: number): void {
  x = c;
  const { scene, alpha } = which(t);
  const pieces = [wallA, wallB, wallC][scene];
  const rows = fill ? Math.min(4, Math.ceil((45 - topY - 20) / 36)) : 0;
  const base0 = Math.round(w / 2 - TILE / 2);
  c.save();
  c.globalAlpha = alpha;
  for (let row = 0; row <= rows; row++) {
    for (let k = -3; k <= 3; k++) {
      const bx = base0 + k * TILE + (row % 2) * 130;
      if (bx > w || bx < -TILE) continue;
      if (row > 0 && hs(k * 7 + scene, row) > 0.2) continue;
      c.save();
      c.translate(bx, -OY - row * 36);
      pieces();
      c.restore();
    }
  }
  c.restore();
}

/** Paint on the fence and the guy with the can (draw after the fence). */
export function drawGraffitiFront(c: CanvasRenderingContext2D, t: number, w: number): void {
  x = c;
  const { scene, lt, alpha } = which(t);
  const base0 = Math.round(w / 2 - TILE / 2);
  c.save();
  c.globalAlpha = alpha;
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
