import { drawParkSky, heroHit, skyBusy } from "./parksky";
import { guardianHit, drawTrain } from "./trainsky";
import { drawGraffitiFront, drawGraffitiWall } from "./graffiti";
import { LedScreen, SCREEN_NEEDS } from "./ledscreen";
import type { CrowdStyle } from "./skins";

const DK = "#1c1c22";
const SKIN = ["#f2c9a0", "#d9a073", "#a86f45", "#7a4a2c"];
const HAIR = ["#1c1c22", "#4a3020", "#8a5a2a", "#c9a24a"];
const SHIRTS = ["#e8731f", "#f4f6fb", "#3a5493", "#9aa1ad"];
const BANDS = ["#181a30", "#1b1e36", "#1e223c", "#222643", "#262a4a", "#2a2f52"];
/** How tall the strip of crowd is when only the front row is shown (art pixels). */
export const CROWD_ROW_H = 30;
const TIERS = 6;
const TIER_H = 12;
export const STANDS_H = TIERS * TIER_H + 3;
export const LED_H = STANDS_H;
/** Height from the fixed key light up in the stands down to the floor. */
export const KEY_LIGHT_H = 96;
export const OUTDOOR_H = 71;

const FONT: Record<string, string[]> = {
  H: ["10001", "10001", "11111", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "11110", "10000", "10000"],
  S: ["01111", "10000", "01110", "00001", "11110"],
  M: ["10001", "11011", "10101", "10001", "10001"],
  G: ["01110", "10000", "10011", "10001", "01110"],
  A: ["01110", "10001", "11111", "10001", "10001"],
  L: ["10000", "10000", "10000", "10000", "11111"],
  E: ["11111", "10000", "11110", "10000", "11111"],
  W: ["10001", "10001", "10101", "11011", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001"],
  V: ["10001", "10001", "10001", "01010", "00100"],
  Y: ["10001", "01010", "00100", "00100", "00100"],
  X: ["10001", "01010", "00100", "01010", "10001"],
  I: ["01110", "00100", "00100", "00100", "01110"],
  T: ["11111", "00100", "00100", "00100", "00100"],
  "!": ["00100", "00100", "00100", "00000", "00100"],
  "*": ["00000", "01010", "00100", "01010", "00000"],
  B: ["11110", "10001", "11110", "10001", "11110"],
  C: ["01111", "10000", "10000", "10000", "01111"],
  D: ["11110", "10001", "10001", "10001", "11110"],
  F: ["11111", "10000", "11110", "10000", "10000"],
  J: ["00111", "00010", "00010", "10010", "01100"],
  K: ["10010", "10100", "11000", "10100", "10010"],
  Q: ["01110", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "11110", "10100", "10010"],
  U: ["10001", "10001", "10001", "10001", "01110"],
  Z: ["11111", "00010", "00100", "01000", "11111"],
  "0": ["01110", "10011", "10101", "11001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "01110"],
  ".": ["00000", "00000", "00000", "00000", "00100"],
  ":": ["00000", "00100", "00000", "00100", "00000"],
  ",": ["00000", "00000", "00000", "00100", "01000"],
  "'": ["00100", "00100", "00000", "00000", "00000"],
  "-": ["00000", "00000", "11111", "00000", "00000"],
  "%": ["11001", "11010", "00100", "01011", "10011"],
  " ": ["00000", "00000", "00000", "00000", "00000"],
};
// Tiny 3 x 5 letters for the signs held by the small fans in the upper rows.
const MINI: Record<string, string[]> = {
  G: ["111", "100", "101", "101", "111"],
  O: ["111", "101", "101", "101", "111"],
  W: ["101", "101", "111", "111", "101"],
  I: ["111", "010", "010", "010", "111"],
  N: ["101", "111", "111", "111", "101"],
  M: ["101", "111", "111", "101", "101"],
  V: ["101", "101", "101", "101", "010"],
  P: ["111", "101", "111", "100", "100"],
  Y: ["101", "101", "010", "010", "010"],
  E: ["111", "100", "110", "100", "111"],
  S: ["111", "100", "111", "001", "111"],
  "!": ["010", "010", "010", "000", "010"],
  L: ["100", "100", "100", "100", "111"],
  K: ["101", "101", "110", "101", "101"],
  A: ["010", "101", "111", "101", "101"],
  D: ["110", "101", "101", "101", "110"],
  H: ["101", "101", "111", "101", "101"],
  T: ["111", "010", "010", "010", "010"],
  Z: ["111", "001", "010", "100", "111"],
};
const MILK_MS = 3400;
const PIZZA_MS = 4000;
const SODA_MS = 4400;
const WASH_MS = 6400;
const CAR = ["....bbbbb.....", "...bwwbwwwb...", "..bbbbbbbbbbbl", "bbbbbbbbbbbbbb", "bbkkkbbbbbkkkb", ".kkhkk..kkhkk."];

function adHash(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) >>> 0;
  h = ((h ^ (h >>> 13)) * 1274126177) >>> 0;
  return (h & 255) / 255;
}

/** One pixel of the little car, local coordinates. */
function carPixel(lx: number, ly: number, clean: boolean, t: number): string | null {
  const ch = CAR[ly]?.[lx];
  if (!ch || ch === ".") return null;
  if (ch === "k") return "#1c1c22";
  if (ch === "h") return Math.floor(t / 70) % 2 ? "#c9ced8" : "#6a7186";
  if (ch === "l") return "#ffe28a";
  if (ch === "w") return clean ? "#bfe6ff" : "#7d7a6a";
  if (clean) return ly === 2 && lx >= 3 && lx <= 10 ? "#8cc4ff" : "#2f7fd6";
  return adHash(lx, ly) < 0.3 ? "#4e3622" : "#7a5a38";
}
/** The banners joke around until there is a goal; then they shout GOAL! */
const JOKES = [
  "NOTHING BUT NET. USUALLY.",
  "AIR BALL INSURANCE: ASK US",
  "SPONSORED BY GRAVITY",
  "BRICKS ARE FOR WALLS",
  "DRIBBLE RESPONSIBLY",
  "WARNING: RIM MAY BITE",
  "CALL YOUR COACH. HE IS WORRIED",
  "LUCKY SOCKS NOT INCLUDED",
  "BUY ONE BALL, GET GRAVITY FREE",
  "THIS BANNER INTENTIONALLY LEFT BLANK",
  "SMELLS LIKE TEAM SPIRIT",
  "EAT PIZZA. SHOOT HOOPS.",
  "HYDRATE. THEN MISS AGAIN.",
  "MOM SAW THAT SHOT",
  "SHOT CLOCK: YOUR LUNCH BREAK",
  "YOUR AIM: 100% CONFIDENCE",
];
/** The same jokes in a different order for each banner, so they do not all say the same thing at once. */
const JOKE_MSGS = [0, 5, 10, 3].map((shift) => JOKES.map((_, i) => JOKES[(i + shift) % JOKES.length]).join(" * ") + " * ");
const GOAL_MSG = "GOAL! * GOAL! * GOAL! * ";

const SH = ["#e8731f", "#f4f6fb", "#3a5493", "#9aa1ad", "#3fae5c", "#d94a6a"];


interface Beam {
  sx: number;
  tx: number;
  ty: number;
  half: number;
  rgb: number[];
  p: number;
  big: boolean;
  sy?: number; // source height (negative = above the top of the area)
  taper?: number; // how much the beam narrows toward its end (0..1)
  key?: boolean; // the spotlight that follows the ball
  bx?: number; // ball position, for the shadow cone
  by?: number;
}

/** The key light hangs far above the screen, so the beam is almost parallel. */
export const KEY_SRC_H = 170;

function hue(hd: number): number[] {
  const h = (((hd % 360) + 360) % 360) / 60;
  const x = 1 - Math.abs((h % 2) - 1);
  const m = [[1, x, 0], [x, 1, 0], [0, 1, x], [0, x, 1], [x, 0, 1], [1, 0, x]][Math.floor(h) % 6];
  return m.map((v) => Math.round(80 + 175 * v));
}

const hs = (a: number, b: number): number => {
  let n = (a * 374761393 + b * 668265263) | 0;
  n = (n ^ (n >>> 13)) * 1274126177;
  return (((n ^ (n >>> 16)) >>> 0) % 1000) / 1000;
};

export class Crowd {
  private cheerAt = -1e9;
  private lastCh = 0;
  /** Clock for the scrolling banners: speeds up on goals without making the text jump. */
  private tc = 0;
  private tcLast = 0;
  private fill = false;

  shotStart(now: number): void {
    this.screen.shotStart(now);
  }

  goal(now: number): void {
    this.screen.goal(now);
  }

  /** The court should stay up until this time (0 = no reason to), so a goal replay on the LED screen can finish. */
  holdUntil(style: CrowdStyle, now: number): number {
    return style === "led" ? this.screen.holdUntil(now) : 0;
  }

  cheer(now: number): void {
    this.cheerAt = now;
  }

  active(now: number): boolean {
    return now - this.cheerAt < 2300;
  }

  height(style: CrowdStyle): number {
    return style === "stands" || style === "arena" ? STANDS_H : style === "led" ? LED_H : style === "none" ? 0 : OUTDOOR_H;
  }

  /** baseY = top edge of the court (where the stands end). */
  /** Height from the fixed key light down to the floor. */
  keyH(floorY: number, fill: boolean): number {
    return (fill ? Math.max(60, floorY) : KEY_LIGHT_H) + KEY_SRC_H;
  }

  draw(ctx: CanvasRenderingContext2D, style: CrowdStyle, now: number, w: number, baseY: number, fill = false): void {
    if (style === "none") return;
    const age = now - this.cheerAt;
    const ch = age >= 0 && age < 2200 ? Math.max(0, 1 - Math.max(0, age - 1500) / 700) : 0;
    this.lastCh = ch;
    // The scrolling text runs three times as fast while a goal is celebrated.
    this.tc += Math.min(100, Math.max(0, now - this.tcLast)) * (ch > 0 ? 3 : 1);
    this.tcLast = now;
    this.fill = fill;
    if (style === "stands") this.stands(ctx, now, w, baseY, ch);
    else if (style === "arena") this.arenaBehind(ctx, now, w, baseY, ch);
    else if (style === "led") this.led(ctx, now, w, baseY, ch);
    else if (style === "trainday" || style === "trainnight" || style === "traincanyon") this.train(ctx, now, w, baseY, style);
    else if (style === "street") this.street(ctx, now, w, baseY, ch);
    else if (style === "city") this.city(ctx, now, w, baseY, ch);
    else this.park(ctx, now, w, baseY, ch);
  }

  private r(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, col: string): void {
    c.fillStyle = col;
    c.fillRect(Math.round(x), Math.round(y), w, h);
  }

  private person(
    c: CanvasRenderingContext2D,
    x: number,
    yb: number,
    seed: number,
    t: number,
    cheer: number,
    shirt: string,
    sil: boolean,
  ): void {
    const jump = cheer > 0 ? -Math.abs(Math.sin(t / 120 + seed * 3)) * 3 * cheer : 0;
    const bob = Math.round(Math.sin(t / 300 + seed * 5) * 0.6);
    const y = Math.round(yb - 10 + jump + bob);
    const arms = cheer > 0.3;
    if (sil) {
      this.r(c, x, y + 1, 5, 9, "#0c0e1c");
      this.r(c, x + 1, y, 3, 3, "#0c0e1c");
      this.r(c, x + 1, y, 3, 1, "#2a2e4a");
      if (arms) {
        this.r(c, x - 1, y - 3, 1, 5, "#0c0e1c");
        this.r(c, x + 5, y - 3, 1, 5, "#0c0e1c");
      }
      return;
    }
    this.r(c, x - 1, y - 1, 7, 12, DK);
    if (arms) {
      this.r(c, x - 2, y - 4, 3, 6, DK);
      this.r(c, x + 4, y - 4, 3, 6, DK);
    }
    this.r(c, x + 1, y, 3, 3, SKIN[Math.floor(hs(seed, 1) * 4)]);
    this.r(c, x + 1, y, 3, 1, HAIR[Math.floor(hs(seed, 2) * 4)]);
    this.r(c, x, y + 3, 5, 6, shirt);
    if (arms) {
      this.r(c, x - 1, y - 3, 1, 5, SKIN[1]);
      this.r(c, x + 5, y - 3, 1, 5, SKIN[1]);
    }
    this.prop(c, x, y, seed, t, cheer, false);
  }

  /** Some fans hold up a text sign, a flag, a pennant or a banner. They sway, and wave harder when the crowd cheers. */
  private prop(c: CanvasRenderingContext2D, x: number, y: number, seed: number, t: number, cheer: number, small: boolean): void {
    const v = hs(seed, 11);
    if (v >= 0.05) return;
    const cheering = cheer > 0;
    if (v < 0.025 && small) {
      // A smaller sign for the small fans, with the tiny font.
      const sw = Math.round(Math.sin(t / (cheering ? 110 : 260) + seed) * (cheering ? 1 : 0.6));
      const words = ["GO", "WIN", "MVP", "YES", "GO!"];
      const wd = words[Math.floor(hs(seed, 12) * words.length)];
      const bw = wd.length * 4 + 1;
      const bx = x + 2 - Math.floor(bw / 2) + sw;
      this.r(c, x + 2 + sw, y - 4, 1, 6, DK);
      this.r(c, bx, y - 12, bw + 2, 9, DK);
      this.r(c, bx + 1, y - 11, bw, 7, ["#f4f6fb", "#ffcf70", "#9fd0ff"][Math.floor(hs(seed, 13) * 3)]);
      let cx = bx + 2;
      for (const chr of wd) {
        const g = MINI[chr];
        if (g) for (let r2 = 0; r2 < 5; r2++) for (let k = 0; k < 3; k++) if (g[r2][k] === "1") this.r(c, cx + k, y - 10 + r2, 1, 1, DK);
        cx += 4;
      }
      return;
    }
    if (v < 0.025 && !small) {
      const sw = Math.round(Math.sin(t / (cheering ? 110 : 260) + seed) * (cheering ? 2 : 1));
      const words = ["GO", "WIN", "MVP", "YES", "GO!"];
      const wd = words[Math.floor(hs(seed, 12) * words.length)];
      const bw = wd.length * 6 + 3;
      const bx = x + 2 - Math.floor(bw / 2) + sw;
      this.r(c, x + 2 + sw, y - 8, 1, 8, DK);
      this.r(c, bx, y - 20, bw + 2, 11, DK);
      this.r(c, bx + 1, y - 19, bw, 9, ["#f4f6fb", "#ffcf70", "#9fd0ff"][Math.floor(hs(seed, 13) * 3)]);
      let cx = bx + 3;
      for (const chr of wd) {
        const g = FONT[chr] ?? FONT[" "];
        for (let r2 = 0; r2 < 5; r2++) for (let k = 0; k < 5; k++) if (g[r2][k] === "1") this.r(c, cx + k, y - 17 + r2, 1, 1, DK);
        cx += 6;
      }
      return;
    }
    const col = ["#e8731f", "#3a5493", "#f4f6fb", "#3fae5c"][Math.floor(hs(seed, 13) * 4)];
    const sp = cheering ? 160 : 300;
    if (small) {
      this.r(c, x + 5, y - 9, 1, 12, DK);
      const fw = 5 + Math.round(Math.sin(t / 200 + seed) * (cheering ? 2 : 1));
      this.r(c, x + 6, y - 10, fw + 1, 5, DK);
      this.r(c, x + 6, y - 9, fw, 3, col);
      return;
    }
    const kind = Math.floor(hs(seed, 12) * 3);
    if (kind === 0) {
      this.r(c, x + 5, y - 16, 1, 19, DK);
      for (let i = 0; i < 10; i++) {
        const w = Math.round(Math.sin(t / sp + seed + i * 0.7) * (cheering ? 2 : 1));
        this.r(c, x + 6 + i, y - 16 + w, 1, 7, DK);
        this.r(c, x + 6 + i, y - 15 + w, 1, 5, col);
      }
      this.r(c, x + 9, y - 14, 3, 3, DK);
      this.r(c, x + 10, y - 13, 1, 1, "#ffa94d");
    } else if (kind === 1) {
      this.r(c, x + 5, y - 14, 1, 17, DK);
      const w = Math.round(Math.sin(t / sp + seed) * (cheering ? 2 : 1));
      for (let i = 0; i < 9; i++) {
        const hh = Math.max(1, 6 - Math.floor(i * 0.7));
        const off = Math.floor((6 - hh) / 2);
        this.r(c, x + 6 + i, y - 14 + w + off, 1, hh + 2, DK);
        this.r(c, x + 6 + i, y - 13 + w + off, 1, hh, col);
      }
    } else {
      this.r(c, x - 4, y - 14, 1, 16, DK);
      this.r(c, x + 6, y - 14, 1, 16, DK);
      this.r(c, x - 4, y - 14, 11, 1, DK);
      const w = Math.round(Math.sin(t / sp + seed) * (cheering ? 1 : 0));
      this.r(c, x - 3, y - 13 + w, 9, 10, DK);
      this.r(c, x - 2, y - 12 + w, 7, 8, col);
      this.r(c, x, y - 10 + w, 3, 3, DK);
      this.r(c, x + 1, y - 9 + w, 1, 1, "#ffa94d");
    }
  }

  /**
   * Several fans swing big flags on long poles, each at its own pace and in its own colour. They are spread over every
   * row, from the front to the back. Up in the small rows the flags are scaled down to match the smaller fans.
   * darken(y) gives how much the stands are darkened at a height; the flags are shaded to match but stay solid.
   */
  private bigFlag(c: CanvasRenderingContext2D, t: number, w: number, baseY: number, ch: number, darken?: (y: number) => number): void {
    const cloth = ["#e8731f", "#3a5493", "#3fae5c", "#f4f6fb", "#d94a6a"];
    const specs: { row: number; yb: number; small: boolean; k: number; x: number }[] = [];
    // Every row that can carry a flag, from the front to the back: the big fans first, then the small ones.
    const rowsAll: { yb: number; small: boolean }[] = [];
    const maxRow = this.fill ? 7 : 5;
    for (let r = 1; r <= maxRow; r++) rowsAll.push({ yb: baseY - 2 - r * 12, small: false });
    if (this.fill) {
      let y = baseY - 2 - 8 * 12;
      for (let i = 8; y > 56; i++) {
        rowsAll.push({ yb: y, small: true });
        y -= 10;
      }
    }
    // The flags are spread evenly over the height, and over the width with a golden-ratio step so none line up.
    const n = this.fill ? Math.max(8, Math.round(w / 70)) : Math.max(6, Math.round(w / 100));
    for (let k = 0; k < n; k++) {
      const idx = Math.round((k * (rowsAll.length - 1)) / Math.max(1, n - 1));
      const r = rowsAll[idx];
      specs.push({ row: idx + 1, yb: r.yb, small: r.small, k, x: 0.07 + 0.86 * ((k * 0.618) % 1) });
    }
    for (const s of specs) {
      const k = s.k;
      const sc = s.small ? 0.72 : 1;
      const fx = 3 + 8 * Math.round((w * s.x - 3) / 8) + (s.row % 2) * (s.small ? 3 : 4);
      const yb = s.yb;
      const seed = 777 + k * 13;
      const col = cloth[k % cloth.length];
      const stripe = col === "#f4f6fb" ? "#e8731f" : "#f4f6fb";
      const cheering = ch > 0;
      const rate = (cheering ? 260 : 650) * (0.85 + 0.15 * (k % 3));
      const phase = t / rate + k * 1.7;
      const th = Math.sin(phase) * (cheering ? 0.75 : 0.55);
      const vel = Math.cos(phase);
      const L = Math.round((36 + (k % 3) * 4) * sc);
      const hand = s.small ? 7 : 10;
      const dk = darken ? darken(yb - L / 2) : 0;
      c.globalAlpha = 1 - dk * 0.6;
      if (s.small) this.personSmall(c, fx, yb, seed, t, ch, col === "#f4f6fb" ? "#3a5493" : col);
      else this.person(c, fx, yb, seed, t, ch, col === "#f4f6fb" ? "#3a5493" : col, false);
      c.globalAlpha = 1;
      const sCol = this.shade(col, dk * 0.85);
      const sStripe = this.shade(stripe, dk * 0.85);
      const sPole = this.shade("#b8bec8", dk * 0.85);
      const sEmb = this.shade("#ffa94d", dk * 0.85);
      const hx = fx + 2;
      const hy = yb - hand;
      for (let i = 0; i <= L; i++) {
        this.r(c, Math.round(hx + Math.sin(th) * i) - 1, Math.round(hy - Math.cos(th) * i) - 1, 3, 3, DK);
      }
      for (let i = 0; i <= L; i++) {
        this.r(c, Math.round(hx + Math.sin(th) * i), Math.round(hy - Math.cos(th) * i), 1, 1, sPole);
      }
      const tx = Math.round(hx + Math.sin(th) * L);
      const ty = Math.round(hy - Math.cos(th) * L);
      const dir = vel > 0 ? -1 : 1; // the cloth trails behind the swing
      const len = Math.round((26 + (k % 2) * 4) * sc);
      const hgt = Math.round(16 * sc);
      const amp = (cheering ? 2.6 : 1.6) * sc;
      for (let j = 0; j < len; j++) {
        const oy = Math.round(Math.sin(t / 150 - j * 0.38 + k) * (amp + j * 0.07));
        const x = tx + dir * j;
        this.r(c, x, ty + oy - 1, 1, hgt + 2, DK);
        this.r(c, x, ty + oy, 1, hgt, sCol);
        this.r(c, x, ty + oy + Math.round(hgt * 0.38), 1, Math.max(2, Math.round(hgt * 0.25)), sStripe);
      }
      this.r(c, tx + dir * len, ty - 1, 1, hgt + 2, DK);
      const ex = tx + dir * Math.round(len * 0.45);
      const eo = Math.round(Math.sin(t / 150 - len * 0.45 * 0.38 + k) * (amp + 0.8));
      const es = s.small ? 4 : 6;
      this.r(c, ex - 2, ty + eo + Math.round(hgt * 0.25), es, es + 2, DK);
      this.r(c, ex - 1, ty + eo + Math.round(hgt * 0.25) + 1, es - 2, es, sEmb);
    }
  }

  /** A colour darkened toward the dark of the stands, like the crowd behind it, but still fully solid. */
  private shade(hex: string, a: number): string {
    const p = (i: number): number => parseInt(hex.slice(i, i + 2), 16);
    const mix = (v: number, d: number): number => Math.round(v * (1 - a) + d * a);
    return `rgb(${mix(p(1), 6)},${mix(p(3), 6)},${mix(p(5), 18)})`;
  }

  private label(c: CanvasRenderingContext2D, str: string, x: number, y: number, col: string): void {
    let cx = x;
    for (const chr of str) {
      const g = FONT[chr] ?? FONT[" "];
      for (let r = 0; r < 5; r++) for (let k = 0; k < 5; k++) if (g[r][k] === "1") this.r(c, cx + k, y + r, 1, 1, col);
      cx += 6;
    }
  }

  private personSmall(c: CanvasRenderingContext2D, x: number, yb: number, seed: number, t: number, cheer: number, shirt: string): void {
    const jump = cheer > 0 ? -Math.abs(Math.sin(t / 120 + seed * 3)) * 3.5 * cheer : 0;
    // The same idle bob as the big people, so the upper rows are alive between goals too.
    const bob = Math.round(Math.sin(t / 300 + seed * 5) * 0.6);
    const y = Math.round(yb + jump + bob);
    if (cheer > 0.3) {
      this.r(c, x - 2, y - 12, 3, 7, DK);
      this.r(c, x + 3, y - 12, 3, 7, DK);
    }
    this.r(c, x - 1, y - 9, 6, 10, DK);
    this.r(c, x + 1, y - 8, 2, 2, SKIN[Math.floor(hs(seed, 1) * 4)]);
    this.r(c, x, y - 6, 4, 5, shirt);
    if (cheer > 0.3) {
      this.r(c, x - 1, y - 11, 1, 5, SKIN[1]);
      this.r(c, x + 4, y - 11, 1, 5, SKIN[1]);
    }
    this.prop(c, x, y - 8, seed, t, cheer, true);
  }

  private stairs(c: CanvasRenderingContext2D, x: number, yt: number, h: number, lamp: string | null): void {
    this.r(c, x - 1, yt, 1, h, "#4a5088");
    this.r(c, x + 5, yt, 1, h, "#4a5088");
    this.r(c, x, yt, 5, h, "#0c0e1c");
    this.r(c, x, yt + 2, 5, 1, "#262a50");
    this.r(c, x, yt + 7, 5, 1, "#262a50");
    if (lamp) this.r(c, x + 2, yt + h - 4, 1, 1, lamp);
  }

  private entrance(c: CanvasRenderingContext2D, x: number, yb: number): void {
    const w = 20;
    const h = 16;
    this.r(c, x - 1, yb - h - 1, w + 2, h + 2, DK);
    this.r(c, x, yb - h, w, h, "#0a0b16");
    this.r(c, x, yb - h, 1, 2, "#262a4a");
    this.r(c, x + w - 1, yb - h, 1, 2, "#262a4a");
    for (let k = 0; k < 8; k++) {
      c.fillStyle = `rgba(240,170,80,${(0.15 + k * 0.07).toFixed(2)})`;
      c.fillRect(x + 3, Math.round(yb - 3 - k * 1.5), w - 6, 2);
    }
    c.fillStyle = "rgba(240,170,80,0.12)";
    c.fillRect(x + 5, yb - h + 3, w - 10, h - 5);
  }

  /**
   * Full-screen stands: four blocks (the first is the orange home section) split by stairs, entrances on two levels,
   * flags over the home block, two scrolling ad boards, and rows that get darker and smaller toward the roof,
   * where a truss and a hanging screen finish it off.
   */
  private standsFill(c: CanvasRenderingContext2D, t: number, w: number, baseY: number, ch: number): void {
    const secW = w / 4;
    const rows: { i: number; y: number; h: number }[] = [];
    const entrances: [number, number][] = [];
    const flags: [number, number][] = [];
    let y = baseY - 2;
    for (let i = 0; y > -12; i++) {
      const h = i >= 8 ? 10 : 12;
      rows.push({ i, y, h });
      if (i === 5 || i === 11) for (let k = 1; k < 4; k++) entrances.push([Math.round(k * secW) - 10, y - 2]);
      if (i === 2) flags.push([y, h]);
      y -= h;
    }
    // Back rows first, so the arms of the row in front are never covered.
    for (let n = rows.length - 1; n >= 0; n--) {
      const { i, y: ry, h } = rows[n];
      const small = i >= 8;
      const sp = small ? 6 : 8;
      const yt = ry - h;
      for (let k = 0; k < 4; k++) {
        const col = k === 0 ? "#2d2840" : i % 2 ? "#242846" : "#262a4a";
        this.r(c, Math.round(k * secW), yt, Math.ceil(secW), h, col);
      }
      this.r(c, 0, ry - 2, w, 2, "#10121f");
      this.r(c, 0, ry - 3, w, 1, "#32375c");
      for (let x = 3; x < w - 4; x += sp) {
        const sec = Math.floor(x / secW);
        if (Math.floor((x + sp) / secW) !== sec) {
          this.stairs(c, Math.round((sec + 1) * secW) - 3, yt, h, i % 3 === 0 ? "#e8731f" : null);
          continue;
        }
        const seed = x * 7 + i * 31;
        if (hs(seed, 9) < 0.07) continue;
        const shirt = sec === 0 ? (hs(seed, 4) > 0.2 ? SHIRTS[0] : SHIRTS[1]) : SHIRTS[(Math.floor(hs(seed, 4) * 3) + sec) % 4];
        const px = x + (i % 2) * Math.floor(sp / 2);
        if (small) this.personSmall(c, px, ry - 2, seed, t, ch, shirt);
        else this.person(c, px, ry - 2, seed, t, ch, shirt, false);
      }
    }
    for (const [fy, fh] of flags) {
      for (let x = 8; x < secW - 8; x += 26) {
        const wv = Math.floor(Math.sin(t / 300 + x) * 2);
        this.r(c, x, fy - fh - 10, 1, 10, DK);
        this.r(c, x + 1, fy - fh - 10, 8 + wv, 5, "#e8731f");
      }
    }
    for (const [x, yb] of entrances) this.entrance(c, x, yb);
    for (let yy = 0; yy < baseY; yy += 2) {
      const a = 0.06 + (0.86 - 0.06) * Math.pow(1 - yy / baseY, 1.3);
      c.fillStyle = `rgba(6,6,18,${Math.min(0.95, a).toFixed(2)})`;
      c.fillRect(0, yy, w, 2);
    }
    // Ad boards, drawn after the darkening so they glow.
    // The two boards split the stands (roof to court) into three equal parts.
    const roofBottom = 22;
    const part = (baseY - roofBottom - 18) / 3;
    const boards: [number, number, string][] = [
      [roofBottom + part + 9, 1, JOKE_MSGS[1]],
      [roofBottom + 2 * part + 18, -1, JOKE_MSGS[2]],
    ];
    for (const [bottom, dir, jokes] of boards) {
      const msg = ch > 0 ? GOAL_MSG : jokes;
      const by = Math.round(bottom) - 1;
      const flashOn = ch > 0 && Math.floor(t / 110) % 2 === 0;
      this.r(c, 0, by - 9, w, 9, flashOn ? "#e8731f" : DK);
      this.r(c, 0, by - 8, w, 7, flashOn ? "#7a3a10" : "#0e0f18");
      this.r(c, 0, by - 8, w, 1, "#2a2e50");
      const adv = msg.length * 6;
      const off = (((dir > 0 ? Math.floor(this.tc / 50) : -Math.floor(this.tc / 50)) % adv) + adv) % adv;
      const col = ch > 0 && Math.floor(t / 120) % 2 ? "#fff6a0" : "#ff9a4a";
      for (let k = -1; k <= Math.ceil(w / adv) + 1; k++) {
        for (let j = 0; j < msg.length; j++) {
          const g = FONT[msg[j]] ?? FONT[" "];
          const gx = k * adv + j * 6 - off;
          for (let r = 0; r < 5; r++) {
            for (let q = 0; q < 5; q++) if (g[r][q] === "1" && gx + q >= 0 && gx + q < w) this.r(c, gx + q, by - 7 + r, 1, 1, col);
          }
        }
      }
      c.fillStyle = "rgba(255,190,100,0.25)";
      c.fillRect(0, by, w, 1);
    }
    // The flags are in front of the ad boards, so they are drawn after them, at full strength at every height.
    this.bigFlag(c, t, w, baseY, ch, (y) => Math.min(0.9, 0.06 + 0.8 * Math.pow(1 - Math.max(0, y) / baseY, 1.3)));
    this.r(c, 0, 0, w, 18, "#0a0b16");
    this.r(c, 0, 18, w, 2, DK);
    for (let x = 0; x < w; x += 24) {
      this.r(c, x, 0, 3, 18, "#1c1f36");
      this.r(c, x, 6, 24, 2, "#1c1f36");
    }
    for (let x = 10; x < w; x += 24) {
      const on = Math.floor(t / 400 + x) % 5 !== 0;
      this.r(c, x, 19, 3, 3, on ? "#ffcf70" : "#3a3320");
    }
    this.pod(c, t, ch, Math.round(w / 2));
  }

  private podA: HTMLCanvasElement | null = null;

  private scrollText(c: CanvasRenderingContext2D, x: number, y: number, w: number, msg: string, col: string, dir: number): void {
    // On a goal the band blinks with a blue glow around it.
    const blink = this.lastCh > 0 && Math.floor(this.tc / 330) % 2 === 0;
    if (blink) {
      c.fillStyle = "rgba(80,160,255,0.28)";
      c.fillRect(x - 3, y - 3, w + 6, 13);
      c.fillStyle = "rgba(80,160,255,0.45)";
      c.fillRect(x - 1, y - 1, w + 2, 9);
    }
    this.r(c, x, y, w, 7, blink ? "#1f4fb0" : "#05060e");
    const adv = msg.length * 6;
    const off = (((Math.floor(this.tc / 60) * dir) % adv) + adv) % adv;
    for (let k = -1; k <= Math.ceil(w / adv) + 1; k++) {
      for (let j = 0; j < msg.length; j++) {
        const g = FONT[msg[j]] ?? FONT[" "];
        const gx = x + k * adv + j * 6 - off;
        for (let r = 0; r < 5; r++) for (let q = 0; q < 5; q++) if (g[r][q] === "1" && gx + q >= x && gx + q < x + w) this.r(c, gx + q, y + 1 + r, 1, 1, col);
      }
    }
  }

  /** One of the video screens under the pod. skew tilts the top edge so the screens look angled outward. */
  private podScreen(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, t: number, ch: number, kind: number, skew: number): void {
    const flash = ch > 0 && Math.floor(t / 140) % 2 === 0;
    const milk = kind === 1 ? this.ad(t) : null;
    for (let i = 0; i < w; i++) {
      const sh = Math.round(skew * (i / w));
      this.r(c, x + i, y + sh - 1, 1, h + 2, DK);
      for (let j = 0; j < h; j++) {
        let col: string;
        if (ch > 0) col = flash ? "#ffcf70" : "#e8731f";
        else if (kind === 2) col = this.liveCam(i, j, w, h, t);
        else col = milk ? milk(i, j) : "#10183a";
        this.r(c, x + i, y + sh + j, 1, 1, col);
      }
    }
    if (ch > 0) this.label(c, "GOAL!", x + Math.max(1, Math.floor((w - 29) / 2)), y + Math.floor(h / 2) - 2, DK);
  }

  /** The milk advert: a guy drinks a glass of milk and ends up with a milk moustache. */
  private milkAd(t: number): (i: number, j: number) => string {
    const p = (t / 3400) % 1;
    const drinking = p < 0.38;
    const lowering = p >= 0.38 && p < 0.52;
    const done = p >= 0.52;
    const word = "MILK";
    // Glass position: at the mouth while drinking, then it moves down and to the right.
    const f = lowering ? (p - 0.38) / 0.14 : done ? 1 : 0;
    const gx = Math.round(10 + f * 7);
    const gy = Math.round(10 + f * 3);
    // The glass is empty exactly when the drinking ends, and that is also when the moustache shows up.
    const level = drinking ? 5 - Math.floor((p / 0.38) * 5) : 0;
    return (i, j) => {
      // The glass (in front of the face while drinking).
      if (i >= gx && i <= gx + 4 && j >= gy && j <= gy + 6) {
        if (i === gx || i === gx + 4 || j === gy + 6) return "#9fd0ff";
        return gy + 6 - j <= level ? "#ffffff" : "#16254a";
      }
      // The title in the top rows.
      if (j >= 1 && j <= 5) {
        const k = Math.floor((i - 3) / 4);
        const ch = word[k];
        const g = ch ? MINI[ch] : undefined;
        if (g && (i - 3) % 4 < 3 && g[j - 1][(i - 3) % 4] === "1") return "#ffffff";
      }
      // The guy: head with hair, eyes, mouth and the moustache.
      if (i >= 4 && i <= 13 && j >= 7 && j <= 16) {
        if (i === 4 || i === 13 || j === 16) return "#1c1c22";
        if (j <= 8) return "#4a3020";
        if (j === 10 && (i === 6 || i === 11)) return "#1c1c22";
        if (!drinking && j === 13 && i >= 6 && i <= 11) return "#ffffff";
        if (!drinking && j === 14 && (i === 6 || i === 11)) return "#ffffff";
        if (j === 14 && i >= 7 && i <= 10 && !drinking) return "#a8402f";
        if (drinking && j === 14 && i >= 8 && i <= 9) return "#1c1c22";
        return "#f2c9a0";
      }
      return "#2a4a9a";
    };
  }

  /** The ads take turns on the same screen: milk, pizza, soda. */
  private ad(t: number): (i: number, j: number) => string {
    const m = t % (MILK_MS + PIZZA_MS + SODA_MS + WASH_MS);
    if (m < MILK_MS) return this.milkAd(m);
    if (m < MILK_MS + PIZZA_MS) return this.pizzaAd(m - MILK_MS);
    if (m < MILK_MS + PIZZA_MS + SODA_MS) return this.sodaAd(m - MILK_MS - PIZZA_MS);
    return this.washAd(m - MILK_MS - PIZZA_MS - SODA_MS);
  }

  /** One word in the mini font, used by the ad titles (rows 1-5). */
  private adText(i: number, j: number, word: string, x0: number): boolean {
    if (j < 1 || j > 5 || i < x0) return false;
    const g = MINI[word[Math.floor((i - x0) / 4)]];
    return !!g && (i - x0) % 4 < 3 && g[j - 1][(i - x0) % 4] === "1";
  }

  /** The pizza advert: a slice is pulled out, the cheese strand snaps and the sign flips to HOT. */
  private pizzaAd(t: number): (i: number, j: number) => string {
    const p = t / PIZZA_MS;
    const f = p < 0.15 ? 0 : p < 0.55 ? Math.min(1, (p - 0.15) / 0.4) : 1;
    const snapped = p >= 0.55;
    const ox = Math.round(f * 8);
    const oy = -Math.round(f * 5);
    const cx = 8;
    const cy = 11;
    const R = 6;
    const dist = (x: number, y: number): number => Math.hypot(x - cx, y - cy);
    const inWedge = (x: number, y: number): boolean => {
      const a = Math.atan2(y - cy, x - cx);
      return a > -1.3 && a < -0.3 && dist(x, y) > 0.5;
    };
    const pepperoni = [[6, 10], [10, 9], [9, 13], [5, 13], [11, 11]];
    const body = (x: number, y: number): string | null => {
      const d = dist(x, y);
      if (d > R) return null;
      if (d > R - 1.3) return "#d9923a";
      return pepperoni.some(([a, b]) => a === x && b === y) ? "#c0392b" : "#ffd35a";
    };
    const hot = snapped && Math.floor(t / 300) % 2 === 0;
    return (i, j) => {
      if (f > 0 && inWedge(i - ox, j - oy)) {
        const c = body(i - ox, j - oy);
        if (c) return c;
      }
      if (f > 0 && (f < 1 || !snapped)) {
        for (let s = 1; s < 8; s++) {
          const u = s / 8;
          if (Math.round(cx + ox * u) === i && Math.round(cy + oy * u + Math.sin(u * 3.1) * (1 - f) * 2) === j && f > 0.25) return "#ffd35a";
        }
      }
      if (snapped) {
        const hang = Math.round(3 - ((p - 0.55) / 0.45) * 2);
        if (i === cx + ox && j > cy + oy - 1 && j <= cy + oy + hang) return "#ffd35a";
      }
      if (!(f > 0 && inWedge(i, j))) {
        const c = body(i, j);
        if (c) return c;
      } else if (dist(i, j) <= R) return "#5a1a12";
      if ((!snapped || hot) && this.adText(i, j, snapped ? "HOT!" : "PIZZA", snapped ? 3 : 2)) return snapped ? "#ffcf3a" : "#ffffff";
      if (snapped) {
        for (let k = 0; k < 3; k++) {
          const y = 9 - Math.floor((t / 200 + k * 2) % 5);
          if (i === cx - 3 + k * 3 + Math.round(Math.sin(t / 260 + k)) && j === y && j > 6) return "#ffffffaa";
        }
      }
      return (i + j) % 2 ? "#7a2218" : "#8a281c";
    };
  }

  /** The soda advert: a guy shakes a can, opens it and gets the foam straight in the face. */
  private sodaAd(t: number): (i: number, j: number) => string {
    const p = t / SODA_MS;
    const pop = p >= 0.3 && p < 0.42;
    const after = p >= 0.42;
    const shaking = p < 0.3;
    const jx = shaking && Math.floor(t / 60) % 2 ? 1 : 0;
    const jy = shaking && Math.floor(t / 90) % 2 ? -1 : 0;
    const cx = 15 + jx;
    const ct = 9 + jy;
    const q = after ? Math.min(1, (p - 0.42) / 0.2) : pop ? ((p - 0.3) / 0.12) * 0.5 : 0;
    const hash = (a: number, b: number): number => {
      let h = (a * 374761393 + b * 668265263) >>> 0;
      h = ((h ^ (h >>> 13)) * 1274126177) >>> 0;
      return (h & 255) / 255;
    };
    const jet = pop || (after && p < 0.55);
    const u = (t / 40) % 1;
    return (i, j) => {
      if (jet) {
        for (let k = 0; k < 7; k++) {
          const fr = k / 7 + u / 7;
          const x = Math.round(cx + 1 - fr * 8);
          const y = Math.round(ct - 1 - Math.sin(fr * Math.PI) * 3 + fr * 3);
          if (i === x && j === y) return "#ffffff";
          if (i === x && j === y + 1 && hash(k, Math.floor(t / 50)) < 0.5) return "#cfe6ff";
        }
      }
      if (p >= 0.3 && p < 0.75 && j < ct && j >= ct - 3 && i >= cx && i <= cx + 4 && hash(i, j + Math.floor(t / 70)) < 0.6) return "#ffffff";
      if (i >= cx && i <= cx + 4 && j >= ct && j <= ct + 7) {
        if (j === ct) return "#c9ced8";
        if (i === cx || i === cx + 4) return "#8e1818";
        if (j >= ct + 3 && j <= ct + 4) return "#ffffff";
        return "#d62b2b";
      }
      if (i === cx - 1 && j >= ct + 3 && j <= ct + 5) return "#f2c9a0";
      if (i >= 4 && i <= 13 && j >= 7 && j <= 16) {
        if (i === 4 || i === 13 || j === 16) return "#1c1c22";
        const squint = (pop || after) && j === 10 && (i === 6 || i === 7 || i === 10 || i === 11);
        if (after && squint) return "#1c1c22";
        const foam = q > 0 && (13 - i) / 9 < q * 1.15 && hash(i, j) < 0.92;
        if (foam && !(pop && j < 9)) return hash(i, j + 3) < 0.2 ? "#cfe6ff" : "#ffffff";
        if (j <= 8) return "#4a3020";
        if (!pop && !after && j === 10 && (i === 6 || i === 11)) return "#1c1c22";
        if (squint) return "#1c1c22";
        if (!after && j === 14 && i >= 8 && i <= 9) return pop ? "#a8402f" : "#1c1c22";
        if (after && j === 14 && i >= 7 && i <= 10) return "#a8402f";
        return "#f2c9a0";
      }
      if (this.adText(i, j, "SODA", 3)) return "#ffffff";
      return j < 9 ? "#1d2f7a" : "#233a90";
    };
  }

  /** The car wash advert: the car stays in the middle and the tunnel slides past it. */
  private washAd(t: number): (i: number, j: number) => string {
    const s = (t / WASH_MS) * 205; // how far the tunnel has scrolled
    const clean = s >= 90;
    let foam = 0;
    if (s >= 40 && s < 85) foam = Math.min(1, (s - 40) / 10);
    else if (s >= 85 && s < 110) foam = 1 - (s - 85) / 25;
    const bob = Math.round(Math.sin(t / 90) * 0.4);
    const shiny = s >= 165;
    const twinkle = [0, 1, 2, 1][Math.floor(t / 110) % 4];
    return (i, j) => {
      const wx = i + s - 11; // world x under this screen column
      const lx = i - 4;
      const ly = j - 9 - bob;
      const body = carPixel(lx, ly, clean, t);
      if (body) {
        const ch = CAR[ly][lx];
        if (ch !== "k" && ch !== "h" && ch !== "l") {
          if (foam > 0 && adHash(i, j + Math.floor(t / 130)) < foam * 1.1) return adHash(i + 4, j) < 0.25 ? "#cfe6ff" : "#ffffff";
          if (s >= 148 && s < 175 && clean && Math.abs(i + j - (11 + (s - 148) * 0.9)) < 1) return "#ffffff";
        }
        return body;
      }
      if (shiny) {
        const dx = Math.abs(i - 15);
        const dy = Math.abs(j - 7);
        if (dx === 0 && dy === 0) return "#ffffff";
        if ((dx === 0 && dy <= twinkle) || (dy === 0 && dx <= twinkle)) return "#fff3a0";
        if (twinkle >= 2 && dx === 1 && dy === 1) return "#ffe070";
      }
      if (j >= 4 && j <= 14) {
        if (wx >= 38 && wx <= 44 && (adHash(wx - 38, Math.floor(t / 120) + j) < 0.7 || j < 9)) return (j + Math.floor(t / 100)) % 3 ? "#ffffff" : "#cfe6ff";
        if (wx >= 72 && wx <= 82 && j >= 5 && j <= 8) return Math.floor(wx + j + t / 60) % 2 ? "#e8392b" : "#9b1f1f";
        if (wx >= 105 && wx <= 116 && j >= 5 && (wx * 7 + j * 3 - Math.floor(t / 60)) % 5 === 0) return "#7fd0ff";
        if (wx >= 142 && wx <= 156 && j >= 5 && j <= 13 && j % 2 === 0 && (wx + Math.floor(t / 50)) % 4 < 2) return "#ffffff";
        if (wx >= 140 && wx <= 158 && j === 5) return "#aab4c6";
        if (wx >= 185) return j < 8 ? "#87ceeb" : j < 14 ? "#a4dcf4" : "#6bb86a";
      }
      if (j >= 15) return j === 15 ? (((wx % 6) + 6) % 6 < 3 ? "#8a93a5" : "#5b6678") : "#3a4252";
      if (j === 0 && ((wx % 12) + 12) % 12 < 3) return "#ffe070";
      if (this.adText(i, j, shiny ? "SHINY" : "WASH", shiny ? 1 : 2)) return shiny ? "#ffe070" : "#ffffff";
      return j < 8 ? "#1f3d52" : "#27495f";
    };
  }

  /** A little camera that follows the ball: ball in the middle, with the floor and the ring when they come into view. */
  private liveCam(i: number, j: number, w: number, h: number, t: number): string {
    // The red LIVE dot in the corner blinks.
    if (i >= 1 && i <= 2 && j >= 1 && j <= 2 && Math.floor(t / 500) % 2 === 0) return "#ff2a2a";
    const zoom = 3; // world pixels per screen pixel (further away, so more of the scene is in view)
    const wx = this.ballX + (i - w / 2) * zoom;
    const wy = this.ballYAbs + (j - h / 2) * zoom;
    const d = Math.hypot(wx - this.ballX, wy - this.ballYAbs);
    if (d < 10.5) return d > 8.6 ? "#1c1c22" : wx + wy < this.ballX + this.ballYAbs - 6 ? "#ffa94d" : "#ee7a24";
    if (this.liveHx >= 0) {
      const q = ((wx - this.liveHx) / 13) ** 2 + ((wy - this.liveRimY) / 3.6) ** 2;
      if (q > 0.65 && q < 1.2) return "#e8731f";
      const depth = wy - this.liveRimY;
      if (depth > 2 && depth < 22 && Math.abs(wx - this.liveHx) < 12 * (1 - depth / 34) && (Math.round(wx) + Math.round(wy)) % 4 === 0) return "#f4f6fb";
    }
    if (this.floorYAbs && wy >= this.floorYAbs) return wy < this.floorYAbs + 3 ? "#1c1c22" : "#8a6a40";
    return (Math.round(wx) * 7 + Math.round(wy) * 13) % 11 < 1 ? "#1c2a50" : "#10183a";
  }

  /**
   * The centre-hung scoreboard: a six-sided pod on cables with an orange LED band around the middle and a ring of
   * video screens underneath. It is drawn at twice the size.
   */
  private pod(c: CanvasRenderingContext2D, t: number, ch: number, cx: number): void {
    const PW = 150;
    const PH = 130;
    if (!this.podA) {
      this.podA = document.createElement("canvas");
      this.podA.width = PW;
      this.podA.height = PH;
    }
    const a = this.podA.getContext("2d")!;
    a.setTransform(1, 0, 0, 1, 0, 0);
    a.clearRect(0, 0, PW, PH);
    // Draw in "pod coordinates" (centre x 150, top 18) at 2x.
    a.setTransform(2, 0, 0, 2, PW / 2 - 300, -36);
    const x0 = 150;
    for (let y = 0; y < 10; y++) {
      const w2 = 34 + Math.round(y * 2.2);
      const x = x0 - Math.floor(w2 / 2);
      this.r(a, x - 1, 29 + y, w2 + 2, 1, DK);
      this.r(a, x, 29 + y, w2, 1, y < 2 ? "#3a3f66" : "#14172a");
    }
    this.r(a, x0 - 28, 39, 56, 10, DK);
    this.r(a, x0 - 27, 40, 54, 8, "#0e1a2a");
    this.scrollText(a, x0 - 27, 40, 54, ch > 0 ? GOAL_MSG : JOKE_MSGS[3], ch > 0 ? "#ffffff" : "#7fe0ff", -1);
    for (let y = 0; y < 6; y++) {
      const w2 = 56 - y * 4;
      const x = x0 - Math.floor(w2 / 2);
      this.r(a, x - 1, 49 + y, w2 + 2, 1, DK);
      this.r(a, x, 49 + y, w2, 1, "#14172a");
    }
    this.podScreen(a, x0 - 24, 50, 22, 17, t, ch, 1, 2);
    this.podScreen(a, x0 + 2, 50, 22, 17, t, ch, 2, -2);
    for (let k = 0; k < 5; k++) this.r(a, x0 - 14 + k * 7, 68, 3, 2, Math.floor(t / 260 + k) % 2 ? "#ffcf70" : "#3a3320");
    a.setTransform(1, 0, 0, 1, 0, 0);
    const ox = cx - PW / 2;
    const oy = 18;
    // The cables are thin, so they are drawn at normal size rather than at 2x.
    for (const x of [cx - 26, cx + 26]) {
      this.r(c, x - 1, 20, 1, 22, DK);
      this.r(c, x, 20, 1, 22, "#3a3f66");
    }
    c.drawImage(this.podA, ox, oy);
  }

  private stands(c: CanvasRenderingContext2D, t: number, w: number, baseY: number, ch: number): void {
    if (this.fill) {
      this.standsFill(c, t, w, baseY, ch);
      return;
    }
    const top = baseY - STANDS_H;
    const n = this.fill ? Math.ceil((baseY - 2) / TIER_H) : TIERS;
    for (let i = 0; i < n; i++) this.r(c, 0, baseY - 2 - (i + 1) * TIER_H, w, TIER_H, BANDS[Math.min(TIERS - 1, i)]);
    if (!this.fill) this.r(c, 0, top, w, 1, DK);
    // Back rows first, so the arms of the row in front are never covered.
    for (let i = n - 1; i >= 0; i--) {
      const yt = baseY - 2 - (i + 1) * TIER_H;
      this.r(c, 0, yt + 10, w, 3, "#10121f");
      this.r(c, 0, yt + 9, w, 1, "#3a3f66");
      for (let x = 4; x < w - 6; x += 8) {
        const col = Math.floor((x + i * 4) / 8);
        if (col % 6 === 5) continue;
        const seed = col * 7 + i * 31;
        if (hs(seed, 9) < 0.08) continue;
        const sec = Math.floor(x / 100);
        this.person(c, x + (i % 2) * 4, yt + 10, seed, t, ch, SHIRTS[(Math.floor(hs(seed, 4) * 3) + sec) % 4], false);
      }
      for (let x = 4 + 8 * 5; x < w; x += 48) {
        this.r(c, x - 3 + (i % 2) * 4, yt, 6, 13, "#232640");
        this.r(c, x - 3 + (i % 2) * 4, yt, 6, 1, "#5a6090");
      }
    }
    this.bigFlag(c, t, w, baseY, ch);
  }

  private led(c: CanvasRenderingContext2D, t: number, w: number, baseY: number, ch: number): void {
    const top = this.fill ? 0 : baseY - LED_H;
    const hh = baseY - top;
    if (!this.fill) this.r(c, 0, top, w, 1, DK);
    for (let y = 1; y < hh; y++) this.r(c, 0, top + y, w, 1, y < hh - 41 ? "#0c0e1a" : "#141830");
    for (let bx = 30; bx < w; bx += 58) {
      for (let y = 0; y < 22; y++) {
        const bw = Math.max(0, Math.round(12 - Math.max(0, y - 14) * 1.7));
        this.r(c, bx + Math.round((12 - bw) / 2), top + 1 + y, bw, 1, Math.round((bx - 30) / 58) % 2 === 0 ? "#e8731f" : "#f4f6fb");
      }
      this.r(c, bx - 1, top + 1, 1, 20, DK);
      this.r(c, bx + 12, top + 1, 1, 20, DK);
    }
    const slot = Math.floor(t / 1400);
    for (let i = 0; i < 14; i++) {
      if (Math.floor((t / 130 + i * 7.3) % 11) !== 0) continue;
      const x = Math.floor(hs(i, slot) * w);
      const y = top + 4 + Math.floor(hs(i, 5 + slot) * (hh - 24));
      this.r(c, x - 1, y, 3, 1, "#fff");
      this.r(c, x, y - 1, 1, 3, "#fff");
    }
    const extra = this.fill ? Math.max(0, Math.floor((baseY - 44 - top - 12) / 8)) : 0;
    for (let r = -extra; r < 5; r++) {
      const yb = baseY - 44 + r * 8;
      this.r(c, 0, yb + 1, w, 8, "#0b0d1a");
      for (let x = 2; x < w - 4; x += 7) {
        if (hs(x, r) > 0.1) this.person(c, x + (r % 2) * 3, yb + 9, x + r * 50, t, ch, "#000", true);
      }
    }
    if (this.fill && baseY - 44 - top >= SCREEN_NEEDS && this.liveHx >= 0) {
      this.screen.draw(c, t, w, top, { x: this.ballX, floorY: this.floorYAbs, y: this.ballYAbs }, { x: this.liveHx, rimY: this.liveRimY, side: this.liveSide }, 10.5);
    }
    if (ch > 0) {
      // Goal: lots of camera flashes all over the crowd.
      const n = Math.round(80 * ch * Math.max(1, hh / LED_H));
      for (let i = 0; i < n; i++) {
        const k = t / 70 + i * 3.7;
        if (Math.floor(k % 6) !== 0) continue;
        const slot = Math.floor(k / 6);
        const x = Math.floor(hs(i, slot) * w);
        const y = top + 4 + Math.floor(hs(i + 200, slot) * (hh - 24));
        const big = hs(i + 400, slot) > 0.7;
        this.r(c, x - 1, y, 3, 1, "#fff");
        this.r(c, x, y - 1, 1, 3, "#fff");
        if (big) {
          this.r(c, x - 3, y, 7, 1, "#fff6a0");
          this.r(c, x, y - 3, 1, 7, "#fff6a0");
        }
      }
    }
    // LED-lista
    const y = baseY - 9;
    const flashOn = ch > 0 && Math.floor(t / 110) % 2 === 0;
    this.r(c, 0, y, w, 9, flashOn ? "#e8731f" : DK);
    this.r(c, 0, y + 1, w, 7, flashOn ? "#7a3a10" : "#0e0f18");
    const ledMsg = ch > 0 ? GOAL_MSG : JOKE_MSGS[0];
    const adv = ledMsg.length * 6;
    const off = Math.floor(this.tc / 60) % adv;
    for (let k = -1; k <= Math.ceil(w / adv) + 1; k++) {
      for (let i = 0; i < ledMsg.length; i++) {
        const g = FONT[ledMsg[i]] ?? FONT[" "];
        const gx = 2 + k * adv + i * 6 - off;
        for (let rr = 0; rr < 5; rr++) {
          for (let cc = 0; cc < 5; cc++) {
            if (g[rr][cc] === "1" && gx + cc > 0 && gx + cc < w - 1) this.r(c, gx + cc, y + 2 + rr, 1, 1, ch > 0 && Math.floor(t / 100) % 2 ? "#fff6a0" : "#ffb257");
          }
        }
      }
    }
  }

  private train(c: CanvasRenderingContext2D, t: number, w: number, baseY: number, style: CrowdStyle): void {
    this.parkDy = baseY - 92;
    c.save();
    c.translate(0, baseY - 92);
    drawTrain(c, style === "trainday" ? "day" : style === "trainnight" ? "night" : "canyon", t, w, this.fill ? -(baseY - 92) : 21);
    c.restore();
  }

  private street(c: CanvasRenderingContext2D, t: number, w: number, baseY: number, ch: number): void {
    c.save();
    c.translate(0, baseY - 92);
    const top = 91 - 70;
    const topFill = this.fill ? -(baseY - 92) : top;
       for(let y=topFill;y<92;y+=4){const r=(y-topFill)/4;for(let x=-8;x<w;x+=8){const bx=x+(r%2)*4,col=['#8a4a3a','#7a3f32','#94503e'][Math.floor(hs(bx,r)*3)];this.r(c,bx,y,7,3,col);this.r(c,bx,y+3,8,1,'#5a2f27');this.r(c,bx+7,y,1,3,'#5a2f27')}}
       if(!this.fill)this.r(c,0,top,w,1,DK);drawGraffitiWall(c,t,w,this.fill,topFill);
       const fy=top+24;
       for(let x=3;x<w-6;x+=10){const seed=x*5+3;if(hs(seed,9)<0.12)continue;this.person(c,x,87,seed,t,ch,SH[Math.floor(hs(seed,4)*6)],false)}
       for(let y=fy;y<88;y++)for(let x=0;x<w;x++){if(((x+y)%5===0)||((x-y+500)%5===0))this.r(c,x,y,1,1,'rgba(190,196,208,0.75)')}
       this.r(c,0,fy-1,w,2,DK);this.r(c,0,fy,w,1,'#c4cad4');for(let x=12;x<w;x+=48){this.r(c,x,fy-2,4,90-fy+2,DK);this.r(c,x+1,fy-1,2,90-fy,'#b8bec8')}
       this.r(c,0,88,w,4,'#8a8f99');this.r(c,0,88,w,1,DK);
       drawGraffitiFront(c,t,w,topFill);
       for(const x of[14,w-24]){this.person(c,x,92,x*3,t,ch,SH[x%4],false)}
    c.restore();
  }

  private city(c: CanvasRenderingContext2D, t: number, w: number, baseY: number, ch: number): void {
    c.save();
    c.translate(0, baseY - 92);
    const top = 91 - 70;
       if(this.fill)this.r(c,0,-(baseY-92),w,top+(baseY-92),'#2a2f5a');
       const bands=['#2a2f5a','#3a3a68','#5a406a','#8a4a6a','#c0605a','#e8731f'];for(let i=0;i<6;i++)this.r(c,0,top+i*9,w,10,bands[i]);if(!this.fill)this.r(c,0,top,w,1,DK);
       let x=0,k=0;while(x<w){const bw=18+Math.floor(hs(k,1)*14),h=22+Math.floor(hs(k,2)*26),col=['#1b1e36','#24284a','#2c3158'][k%3],y0=91-14-h;
        this.r(c,x,y0,bw,h,col);this.r(c,x,y0,bw,1,'#3a4070');this.r(c,x-1,y0-1,bw+2,1,DK);this.r(c,x-1,y0,1,h,DK);
        for(let wy=y0+4;wy<91-18;wy+=6)for(let wx=x+3;wx<x+bw-3;wx+=5){const on=hs(wx,wy)>0.45&&((Math.floor(t/2500)+wx+wy)%9!==0);this.r(c,wx,wy,2,3,on?'#ffcf70':'#12142a')}
        if(k===3){this.r(c,x+4,y0-10,10,6,'#5a3a2a');this.r(c,x+5,y0-4,1,4,'#5a3a2a');this.r(c,x+12,y0-4,1,4,'#5a3a2a')}
        x+=bw+1;k++}
       this.r(c,0,77,w,14,'#3a3f55');this.r(c,0,77,w,1,DK);this.r(c,0,84,w,1,'#4a506a');
       for(let xx=4;xx<w-6;xx+=9){const seed=xx*7+2;if(hs(seed,9)<0.1)continue;this.person(c,xx+(Math.floor(hs(seed,3)*3)),90,seed,t,ch,SH[Math.floor(hs(seed,4)*6)],false)}
       for(let lx=40;lx<w;lx+=90){this.r(c,lx,top+14,3,76-top-14+2,DK);this.r(c,lx+1,top+14,1,76-top-14+2,'#9aa1ad');this.r(c,lx-4,top+12,11,4,DK);this.r(c,lx-3,top+13,9,2,'#ffcf70');for(let g=1;g<=3;g++)this.r(c,lx-4-g*2,top+17+g*2,17+g*4,1,'rgba(255,207,112,'+(0.18-g*0.04)+')')}
    c.restore();
  }

  private park(c: CanvasRenderingContext2D, t: number, w: number, baseY: number, ch: number): void {
    this.parkDy = baseY - 92;
    c.save();
    c.translate(0, baseY - 92);
    const top = 91 - 70;
       for(let y=this.fill?-(baseY-92):top;y<76;y++)this.r(c,0,y,w,1,y<top+30?'#9ed0ff':'#cfe9ff');if(!this.fill)this.r(c,0,top,w,1,DK);
       drawParkSky(c,t,w,this.fill?-(baseY-92):top);
       for(let tx=30;tx<w+30;tx+=64){const sw=Math.round(Math.sin(t/700+tx)*1),ty=76;this.r(c,tx,ty-30,5,32,DK);this.r(c,tx+1,ty-30,3,31,'#7a4a2a');
        for(const[dx,dy,r] of[[2,-40,14],[-8,-34,10],[12,-34,10]]){for(let yy=-r;yy<=r;yy++)for(let xx=-r;xx<=r;xx++){const d=Math.hypot(xx,yy);if(d>r)continue;this.r(c,tx+dx+xx+sw,ty+dy+yy,1,1,d>r-1.2?DK:(xx+yy<-3?'#5ac878':'#2f8f4a'))}}}
       this.r(c,0,76,w,16,'#4aa35a');this.r(c,0,76,w,1,DK);for(let i=0;i<40;i++)this.r(c,Math.floor(hs(i,3)*w),78+Math.floor(hs(i,4)*12),2,1,'#6fc47e');
       for(let bx=26;bx<w-30;bx+=94){this.r(c,bx-1,76,32,10,DK);this.r(c,bx,78,30,2,'#8a5a2a');this.r(c,bx,81,30,2,'#7a4a22');this.r(c,bx+1,83,2,3,'#5a3a1a');this.r(c,bx+27,83,2,3,'#5a3a1a');
        for(let p=0;p<3;p++){const seed=bx*3+p;this.person(c,bx+3+p*9,84,seed,t,ch*0.7,SH[Math.floor(hs(seed,4)*6)],false)}}
       for(let px=70;px<w-30;px+=188){this.r(c,px,86,24,6,DK);for(let a=0;a<4;a++)for(let b=0;b<2;b++)this.r(c,px+1+a*6,87+b*2,3,2,(a+b)%2?'#f4f6fb':'#d94a6a')}
       for(let xx=100;xx<w-10;xx+=82){const seed=xx;this.person(c,xx,92,seed,t,ch,SH[Math.floor(hs(seed,4)*6)],false)}
    c.restore();
  }

  // ---- Arena with moving spotlights ----

  /** Alpha quantised to flat bands (no dithering), so moving light never shimmers. */
  private band(a: number): number {
    return Math.min(255, Math.round((a * 64) / 22) * 22);
  }

  private run(c: CanvasRenderingContext2D, x: number, y: number, len: number, rgb: number[], A: number): void {
    if (A <= 0 || len <= 0) return;
    c.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${A / 255})`;
    c.fillRect(x, y, len, 1);
  }

  private rigs(t: number, ch: number, w: number, floorLocal: number, ballX: number, ballLocalY: number): Beam[] {
    const out: Beam[] = [];
    const sw = w / 300;
    // The key light aims at the ball and the beam carries on past it to the floor. The ball blocks part of it,
    // so the floor pool sits further along the same line, with the ball's shadow in the middle.
    const k = (floorLocal + KEY_SRC_H) / Math.max(20, ballLocalY + KEY_SRC_H);
    const fx = w * 0.5 + (ballX - w * 0.5) * k;
    out.push({ sx: w * 0.5, sy: -KEY_SRC_H, tx: fx, ty: floorLocal, half: 0.07, taper: 0.25, rgb: [255, 244, 215], p: 2.4, big: false, key: true, bx: ballX, by: ballLocalY });
    const rx = w * 0.5 + Math.sin(t / 1500) * w * 0.33;
    out.push({
      sx: w * 0.4,
      tx: rx,
      ty: floorLocal + Math.sin(t / 900) * 7,
      half: 0.07 + 0.07 * (0.5 + 0.5 * Math.sin(t / 1100)),
      rgb: [255, 238, 200],
      p: 2.3,
      big: false,
    });
    const e = Math.min(1, ch * 1.4);
    if (e > 0) {
      for (let i = 0; i < 6; i++) {
        const tx = w * 0.5 + Math.sin(t / 420 - i * 0.9) * w * 0.45;
        out.push({
          sx: 25 * sw + i * ((w - 50 * sw) / 5),
          tx,
          ty: floorLocal + Math.sin(i * 2) * 4,
          half: 0.095,
          rgb: hue(i * 60 + t / 8),
          p: 2.4 * e,
          big: false,
        });
      }
    }
    return out;
  }

  private beam(c: CanvasRenderingContext2D, b: Beam, top: number, ya: number, yb: number, w: number): void {
    const sy = b.sy ?? 0;
    const taper = b.taper ?? 0.5;
    const ang = Math.atan2(b.tx - b.sx, b.ty - sy);
    const L = Math.hypot(b.tx - b.sx, b.ty - sy);
    const cosA = Math.cos(ang) || 1;
    // Per row, the beam is an interval; work out its edges directly instead of testing every pixel's angle.
    for (let y = Math.max(0, Math.floor(ya)); y < Math.min(yb, b.ty + 0.5); y++) {
      const dy = y - sy;
      if (dy < 2) continue;
      const d = dy / cosA;
      const hf = b.half * (1 - taper * Math.min(1, d / L));
      const xl = b.sx + dy * Math.tan(ang - hf);
      const xr = b.sx + dy * Math.tan(ang + hf);
      const xm = (xl + xr) / 2;
      const hw = (xr - xl) / 2 || 1;
      const fall = 0.4 + 0.6 * Math.max(0, 1 - d / (L * 1.05));
      const x0 = Math.max(0, Math.ceil(xl));
      const x1 = Math.min(w, Math.floor(xr) + 1);
      let start = -1;
      let cur = 0;
      for (let x = x0; x <= x1; x++) {
        let A = 0;
        if (x < x1) {
          const edge = 1 - Math.abs(x - xm) / hw;
          A = this.band(b.p * (0.35 + 0.65 * Math.min(1, edge * 1.6)) * fall);
        }
        if (A !== cur) {
          if (cur > 0) this.run(c, start, top + y, x - start, b.rgb, cur);
          start = x;
          cur = A;
        }
      }
    }
  }

  private geo(b: Beam): { rx: number; ry: number } {
    const dist = b.ty - (b.sy ?? 0);
    const ang = Math.atan2(b.tx - b.sx, dist);
    // The beam tapers toward the floor, so the pool matches the beam's width there.
    const he = b.half * (1 - (b.taper ?? 0.5));
    const chord = (dist * (Math.tan(ang + he) - Math.tan(ang - he))) / 2;
    const rx = Math.min(70, Math.max(b.key ? 14 : 9, 1.05 * chord));
    return { rx, ry: Math.max(5, rx * 0.3) };
  }

  /** The ball's shadow inside the beam: a dark cone from the ball down to the floor pool. */
  private shadowCone(c: CanvasRenderingContext2D, b: Beam, top: number, ya: number, yb: number, w: number): void {
    if (b.bx === undefined || b.by === undefined) return;
    const k = (b.ty + KEY_SRC_H) / Math.max(20, b.by + KEY_SRC_H);
    const R = 10;
    const y0 = Math.max(Math.floor(ya), Math.floor(b.by + R * 0.5), 0);
    const y1 = Math.min(Math.ceil(yb), b.ty);
    for (let y = y0; y < y1; y++) {
      const t = (y - b.by) / Math.max(1, b.ty - b.by);
      const cx = b.bx + (b.tx - b.bx) * Math.min(1, Math.max(0, t));
      const wd = R * (1 + t * (k - 1) * 0.9);
      let start = -1;
      let cur = 0;
      const xe = Math.min(w, Math.ceil(cx + wd));
      for (let x = Math.max(0, Math.floor(cx - wd)); x <= xe; x++) {
        let A = 0;
        if (x < xe) {
          const q = Math.abs(x - cx) / wd;
          if (q <= 1) A = this.band(0.55 * (1 - q * 0.4) * (1 - t * 0.35));
        }
        if (A !== cur) {
          if (cur > 0) this.run(c, start, top + y, x - start, [4, 4, 14], cur);
          start = x;
          cur = A;
        }
      }
    }
  }

  /** The ball's shadow in the middle of the floor pool: bigger and fainter the higher the ball is. */
  private shadowPool(c: CanvasRenderingContext2D, b: Beam, top: number, w: number): void {
    if (b.by === undefined) return;
    const k = (b.ty + KEY_SRC_H) / Math.max(20, b.by + KEY_SRC_H);
    const sr = Math.min(26, Math.max(9, 10 * k * 0.95));
    const sry = sr * 0.3;
    const alpha = Math.min(3.6, Math.max(1.5, 3.6 / Math.sqrt(k)));
    for (let y = Math.max(0, Math.floor(b.ty - sry)); y < Math.ceil(b.ty + sry); y++) {
      let start = -1;
      let cur = 0;
      const xe = Math.min(w, Math.ceil(b.tx + sr));
      for (let x = Math.max(0, Math.floor(b.tx - sr)); x <= xe; x++) {
        let A = 0;
        if (x < xe) {
          const q = ((x - b.tx) / sr) ** 2 + ((y - b.ty) / sry) ** 2;
          if (q <= 1) A = this.band(alpha * (1 - q * 0.7));
        }
        if (A !== cur) {
          if (cur > 0) this.run(c, start, top + y, x - start, [4, 4, 14], cur);
          start = x;
          cur = A;
        }
      }
    }
  }

  private spotAt(c: CanvasRenderingContext2D, b: Beam, top: number, w: number): void {
    const { rx, ry } = this.geo(b);
    const y0 = Math.max(0, Math.floor(b.ty - ry));
    const y1 = Math.ceil(b.ty + ry);
    for (let y = y0; y < y1; y++) {
      let start = -1;
      let cur = 0;
      const xe = Math.min(w, Math.ceil(b.tx + rx));
      for (let x = Math.max(0, Math.floor(b.tx - rx)); x <= xe; x++) {
        let A = 0;
        if (x < xe) {
          const q = ((x - b.tx) / rx) ** 2 + ((y - b.ty) / ry) ** 2;
          if (q <= 1) A = this.band(b.p * 1.7 * (1 - q * 0.7));
        }
        if (A !== cur) {
          if (cur > 0) this.run(c, start, top + y, x - start, b.rgb, cur);
          start = x;
          cur = A;
        }
      }
    }
  }

  private screen = new LedScreen();
  /** Where the park's local coordinates start on the screen. */
  private parkDy = 0;

  /** Does the ball (in screen art pixels) hit the flying hero in the Park theme's sky? */
  shootAtHero(style: CrowdStyle, x: number, y: number, rad: number): boolean {
    return style === "park" && heroHit(x, y - this.parkDy, rad);
  }

  /** Does the ball (in screen art pixels) hit Night Owl in the night city? Returns the way he knocks it, or null. */
  guardianSwat(style: CrowdStyle, x: number, y: number, rad: number): number | null {
    return style === "trainnight" ? guardianHit(x, y - this.parkDy, rad, performance.now()) : null;
  }

  /** Something in the sky is still going on (smoke, a falling hero), so keep drawing. */
  skyBusy(): boolean {
    return skyBusy();
  }

  private liveSide: "left" | "right" = "right";
  private liveHx = -1;
  private liveRimY = 0;
  private ballX = 0;
  private ballYAbs = 0;
  private floorYAbs = 0;

  /** Stands, dimmed, with the spotlight beams crossing them. */
  private arenaBehind(c: CanvasRenderingContext2D, t: number, w: number, baseY: number, ch: number): void {
    this.stands(c, t, w, baseY, ch);
    c.fillStyle = this.fill ? "rgba(6,6,18,0.25)" : "rgba(6,6,18,0.55)";
    const top = this.fill ? 0 : baseY - STANDS_H;
    c.fillRect(0, top, w, baseY - top);
    const floorAbs = this.floorYAbs || baseY + 21;
    for (const b of this.rigs(t, ch, w, floorAbs - top, this.ballX || w * 0.8, (this.ballYAbs || floorAbs - 10) - top)) {
      this.beam(c, b, top, 0, baseY - top, w);
      if (b.key) this.shadowCone(c, b, top, 0, baseY - top, w);
    }
  }

  /** Where the hoop ring is, so the live-view screen can show it when the ball is near. */
  setHoop(hx: number, rimY: number, side: "left" | "right" = "right"): void {
    this.liveSide = side;
    this.liveHx = hx;
    this.liveRimY = rimY;
  }

  setBall(x: number, floorY: number, ballY: number): void {
    this.ballX = x;
    this.floorYAbs = floorY;
    this.ballYAbs = ballY;
  }

  /** The part of the light that falls on the court; call after the court is drawn. */
  arenaFloor(c: CanvasRenderingContext2D, t: number, w: number, courtTop: number, courtH: number): void {
    const top = this.fill ? 0 : courtTop + 1 - STANDS_H;
    const floorAbs = this.floorYAbs || courtTop + 21;
    c.fillStyle = "rgba(6,6,18,0.55)";
    c.fillRect(0, courtTop, w, courtH);
    const bs = this.rigs(t, this.lastCh, w, floorAbs - top, this.ballX || w * 0.8, (this.ballYAbs || floorAbs - 10) - top);
    for (const b of bs) {
      this.beam(c, b, top, courtTop - top, floorAbs - top + 14, w);
      if (b.key) this.shadowCone(c, b, top, courtTop - top, floorAbs - top + 14, w);
      this.spotAt(c, b, top, w);
    }
    for (const b of bs) if (b.key) this.shadowPool(c, b, top, w);
  }
}
