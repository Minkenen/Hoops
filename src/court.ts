import { COURT_SKINS, type CourtSkin, type CourtTex } from "./skins";

// NBA half court (47 x 50 ft) as an oblique pixel view: the length runs along the screen, the depth is compressed.
// Scaled so baseline to half-court line covers the full screen width.
export const COURT_KV = 0.8; // pixels per foot of depth

export interface CourtSprite {
  canvas: HTMLCanvasElement;
  w: number;
  h: number;
  cy: number; // y of the court centre line in the sprite
}

const DK = "#1c1c22";
const HX = 5.25; // hoop distance from the baseline in feet
const HY = 25;
const KV = COURT_KV;
const DEPTH = Math.round(50 * KV);
const SLAB = 3;

const near = (a: number, b: number, w: number): boolean => Math.abs(a - b) < w;

function makeLine(K: number): (u: number, v: number) => boolean {
  const vl = (u: number, c: number): boolean => near(u, c, 0.55 / K);
  const hl = (v: number, c: number): boolean => near(v, c, 0.55 / KV);
  const circ = (u: number, v: number, cu: number, cv: number, r: number): boolean => {
    const d = Math.hypot(u - cu, v - cv) || 1e-6;
    const g = Math.hypot((u - cu) / d / K, (v - cv) / d / KV);
    return Math.abs(d - r) < 0.55 * g;
  };
  return (u, v) => {
    if (u < 0 || u > 47 || v < 0 || v > 50) return false;
    if (vl(u, 0) || vl(u, 47) || hl(v, 0) || hl(v, 50)) return true;
    if ((hl(v, 17) || hl(v, 33)) && u <= 19) return true;
    if (vl(u, 19) && v >= 17 && v <= 33) return true;
    const a = Math.atan2(v - 25, u - 19);
    if (circ(u, v, 19, 25, 6) && (u >= 19 || Math.floor((a * 6) / 1.3) % 2 === 0)) return true;
    if (circ(u, v, HX, HY, 4) && u >= HX) return true;
    if ((hl(v, 21) || hl(v, 29)) && u >= 3.5 && u <= HX) return true;
    if (((hl(v, 3) || hl(v, 47)) && u <= 14.2) || (circ(u, v, HX, HY, 23.75) && u > 14.2 && v > 3 && v < 47)) return true;
    return circ(u, v, 47, 25, 6) || circ(u, v, 47, 25, 2);
  };
}

const hs = (a: number, b: number): number => {
  let n = (a * 374761393 + b * 668265263) | 0;
  n = (n ^ (n >>> 13)) * 1274126177;
  return (((n ^ (n >>> 16)) >>> 0) % 1000) / 1000;
};

function crackMask(w: number, n: number, seed: number, count: number): Uint8Array {
  const m = new Uint8Array(w * n);
  const mark = (x: number, y: number): void => {
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi >= 0 && xi < w && yi >= 0 && yi < n) m[yi * w + xi] = 1;
  };
  for (let i = 0; i < count; i++) {
    let x = hs(seed, i) * w;
    let y = hs(seed, i + 50) * n;
    let a = hs(seed, i + 99) * 6.28;
    const len = 25 + hs(seed, i + 7) * 55;
    for (let s = 0; s < len; s++) {
      a += (hs(seed + i, s) - 0.5) * 0.9;
      x += Math.cos(a);
      y += Math.sin(a) * 0.55;
      mark(x, y);
      if (hs(seed * 3 + i, s) > 0.985) {
        let bx = x;
        let by = y;
        let ba = a + (hs(i, s) > 0.5 ? 1 : -1) * 0.9;
        for (let t = 0; t < 10; t++) {
          ba += (hs(s, t) - 0.5) * 0.8;
          bx += Math.cos(ba);
          by += Math.sin(ba) * 0.55;
          mark(bx, by);
        }
      }
    }
  }
  return m;
}

function pickGrain(t: CourtTex, r: number): string {
  let a = 0;
  for (let i = 0; i < t.grain.length; i++) {
    a += t.weights[i];
    if (r < a) return t.grain[i];
  }
  return t.grain[t.grain.length - 1];
}

/** Outdoor surface drawn with the baseline on the left; the caller mirrors it for the right side. */
function texCourt(skin: CourtSkin, tex: CourtTex, w: number, n: number, h: number, line: (u: number, v: number) => boolean, K: number): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const o = cv.getContext("2d")!;
  const lm = new Uint8Array(w * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < w; x++) lm[y * w + x] = line(x / K, y / KV) ? 1 : 0;
  const cm = tex.cracks ? crackMask(w, n, 18, tex.cracks) : new Uint8Array(w * n);
  const patches: number[][] = [];
  for (let i = 0; i < tex.patches; i++) {
    patches.push([Math.floor(hs(3, i) * (w - 50)), Math.floor(hs(3, i + 9) * (n - 12)), 18 + Math.floor(hs(3, i + 5) * 22), 6 + Math.floor(hs(3, i + 3) * 8)]);
  }
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / K;
      const v = y / KV;
      const pnt = painted(u, v);
      let col: string;
      if (lm[y * w + x] && !(tex.wear && hs(x, y + 400) < tex.wear)) {
        col = skin.line;
      } else {
        const sh = (x > 0 && lm[y * w + x - 1]) || (y > 0 && lm[(y - 1) * w + x]) || (x > 0 && y > 0 && lm[(y - 1) * w + x - 1]);
        if (sh && !tex.wear) {
          col = DK;
        } else {
          col = pickGrain(tex, hs(x, y));
          if (pnt) {
            col = hs(x * 3, y * 7) < 0.55 ? skin.zone[0] : skin.zone[1];
            if (tex.wear && hs(x + 99, y + 7) < tex.wear * 1.5) col = pickGrain(tex, hs(x, y));
          }
          if (tex.joints === true && (Math.abs(v - 12.5) < 0.35 || Math.abs(v - 37.5) < 0.35 || Math.abs(u - 23.5) < 0.1) && !pnt) col = tex.grain[3];
          if (tex.joints === "tiles" && (Math.abs(u % 11.75) < 0.12 || Math.abs(v % 12.5) < 0.35) && !pnt) col = skin.slab;
          if (sh && tex.wear && hs(x + 5, y + 5) < 0.5) col = DK;
          for (const [px, py, pw, ph] of patches) {
            if (x >= px && x < px + pw && y >= py && y < py + ph && !pnt) col = hs(x, y) < 0.5 ? "#4a4e57" : "#52565f";
          }
          if (cm[y * w + x]) col = pnt ? "#3a2020" : "#2a2c33";
          if (y < 2) col = skin.hi;
        }
      }
      o.fillStyle = col;
      o.fillRect(x, 1 + y, 1, 1);
    }
  }
  if (tex.puddle) {
    const cx = w * 0.667;
    const rx = w * 0.1;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < w; x++) {
        const dx = (x - cx) / rx;
        const dy = (y - 26) / 5.5;
        const d = dx * dx + dy * dy;
        if (d < 1 && !lm[y * w + x]) {
          o.fillStyle = d > 0.7 ? "#566073" : dy < -0.2 ? "#9fb2c8" : "#7a8ca2";
          o.fillRect(x, 1 + y, 1, 1);
        }
      }
    }
    for (let i = 0; i < 18; i++) {
      const x = Math.floor(cx - rx * 0.5 + hs(i, 4) * rx);
      const y = 22 + Math.floor(hs(i, 5) * 8);
      if (((x - cx) / rx) ** 2 + ((y - 26) / 5.5) ** 2 < 0.5) {
        o.fillStyle = "#e6eef7";
        o.fillRect(x, 1 + y, 2, 1);
      }
    }
    for (const [fx, fy] of [[0.2, 33], [0.31, 12], [0.83, 30]]) {
      o.fillStyle = "#d98aa6";
      o.fillRect(Math.floor(w * fx), 1 + fy, 2, 1);
    }
  }
  o.fillStyle = DK;
  o.fillRect(0, 0, w, 1);
  o.fillStyle = tex.edge;
  o.fillRect(0, 1 + n, w, 3);
  if (tex.curb) {
    o.fillStyle = skin.slab;
    o.fillRect(0, 4 + n, w, 2);
    o.fillStyle = DK;
    o.fillRect(0, 6 + n, w, 1);
  } else {
    o.fillStyle = "#4aa35a";
    for (let x = 0; x < w; x++) if (hs(x, 3) > 0.5) o.fillRect(x, 1 + n + (x % 3 ? 1 : 0), 1, 2);
    o.fillStyle = DK;
    o.fillRect(0, 4 + n, w, 1);
  }
  return cv;
}

const painted = (u: number, v: number): boolean =>
  (u <= 19 && v >= 17 && v <= 33) || Math.hypot(u - HX, v - HY) <= 4 || Math.hypot(u - 47, v - 25) <= 2;

const wood = (u: number, v: number, s: CourtSkin): string => {
  const r = Math.floor(v / 3.2);
  const j = Math.floor((u + (r % 3) * 5) / 10);
  return (r + j) % 2 ? s.wood[0] : s.wood[1];
};

const zone = (v: number, s: CourtSkin): string => (Math.floor(v / 3.2) % 2 ? s.zone[0] : s.zone[1]);

export function makeCourtSprite(side: "left" | "right", width: number, skinId: string): CourtSprite {
  const skin = COURT_SKINS.find((k) => k.id === skinId) ?? COURT_SKINS[0];
  const w = Math.max(60, Math.round(width));
  const K = w / 47;
  const line = makeLine(K);
  const n = DEPTH + 1;
  const h = 1 + n + 7;
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const o = cv.getContext("2d")!;
  const flip = side === "right";
  if (skin.tex) {
    const left = texCourt(skin, skin.tex, w, n, h, line, K);
    if (!flip) return { canvas: left, w, h, cy: 1 + 25 * KV };
    o.save();
    o.translate(w, 0);
    o.scale(-1, 1);
    o.drawImage(left, 0, 0);
    o.restore();
    return { canvas: cv, w, h, cy: 1 + 25 * KV };
  }
  const ux = (x: number): number => (flip ? w - 1 - x : x) / K;
  const mask = new Uint8Array(w * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < w; x++) mask[y * w + x] = line(ux(x), y / KV) ? 1 : 0;
  // The shadow edge sits on the side facing away from the baseline so it follows the mirroring.
  const dx = flip ? 1 : -1;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < w; x++) {
      const u = ux(x);
      const v = y / KV;
      let col: string;
      if (mask[y * w + x]) {
        col = skin.line;
      } else {
        const sx = x + dx;
        const sh =
          (sx >= 0 && sx < w && mask[y * w + sx]) ||
          (y > 0 && mask[(y - 1) * w + x]) ||
          (y > 0 && sx >= 0 && sx < w && mask[(y - 1) * w + sx]);
        col = sh ? DK : painted(u, v) ? zone(v, skin) : wood(u, v, skin);
        if (!sh && y < 2) col = skin.hi;
      }
      o.fillStyle = col;
      o.fillRect(x, 1 + y, 1, 1);
    }
  }
  o.fillStyle = DK;
  o.fillRect(0, 0, w, 1);
  o.fillStyle = skin.slab;
  o.fillRect(0, 1 + n, w, SLAB);
  o.fillStyle = DK;
  o.fillRect(0, 1 + n + SLAB, w, 1);
  return { canvas: cv, w, h, cy: 1 + 25 * KV };
}
