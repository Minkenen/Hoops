// The big screen and the retired jerseys on the LED-board wall: the score, a live view of the ball and a slow-motion replay of every goal.
import { getLast10, getScore, getShots } from "./settings";

const GLYPHS: Record<string, string> = {
  "0": "111101101101111", "1": "010110010010111", "2": "111001111100111", "3": "111001111001111", "4": "101101111001001",
  "5": "111100111001111", "6": "111100111101111", "7": "111001010010010", "8": "111101111101111", "9": "111101111001111",
  A: "010101111101101", C: "111100100100111", D: "110101101101110", E: "111100110100111", H: "101101111101101", I: "111010010010111",
  L: "100100100100111", N: "110101101101101", O: "111101101101111", P: "111101111100100", R: "110101110101101", S: "111100111001111",
  T: "111010010010010", U: "101101101101111", V: "101101101101010", W: "101101111111101", X: "101101010101101", Y: "101101010010010",
  " ": "000000000000000", ".": "000000000000010", "!": "010010010000010",
};

const JERSEYS: [string, string, string, string][] = [
  ["#e8731f", "#ffffff", "#7a3a10", "23"],
  ["#f4f6fb", "#2a4aa0", "#2a4aa0", "8"],
  ["#2a4aa0", "#ffffff", "#e8731f", "32"],
  ["#e8731f", "#ffffff", "#7a3a10", "6"],
];

const HOOP_X = 176; // where the hoop sits in the screen's own world
const REPLAY_SPEED = 0.5;
const SCREEN_W = 128;
const SCREEN_H = 50;
/** Art pixels the whole thing needs, at 2x: the screen, its cables and the jerseys. */
export const SCREEN_NEEDS = 150;

interface Sample {
  t: number;
  x: number;
  y: number;
}

export class LedScreen {
  private c!: CanvasRenderingContext2D;
  private shotAt = 0;
  private goalAt = 0;
  private hist: Sample[] = [];
  private lastGoal: Sample[] | null = null;
  private finalized = false;
  private lastSample = 0;
  private lastDraw = 0;
  private visibleSince = 0;
  private page = "";
  private pageSince = 0;
  private statsAt = -1e9;
  private score = 0;
  private shots = 0;
  private last10: number[] = [];
  private netAt = -1e9;

  shotStart(now: number): void {
    this.shotAt = now;
    this.hist = [];
    this.finalized = false;
  }

  goal(now: number): void {
    this.goalAt = now;
    this.netAt = now;
  }

  /** Keep the court open long enough to see the replay. */
  holdUntil(now: number): number {
    if (!this.goalAt) return 0;
    const len = this.finalized ? this.replayLen() : 4800;
    const until = this.goalAt + 800 + len + 500;
    return now < until ? until : 0;
  }

  private replayLen(): number {
    const g = this.lastGoal;
    return g && g.length > 1 ? ((g[g.length - 1].t - g[0].t) / REPLAY_SPEED) * 1000 : 0;
  }

  private r(x: number, y: number, w: number, h: number, col: string): void {
    this.c.fillStyle = col;
    this.c.fillRect(Math.round(x), Math.round(y), w, h);
  }

  private txt(s: string | number, px: number, py: number, sc: number, col: string): void {
    for (const ch of String(s)) {
      const g = GLYPHS[ch] ?? GLYPHS[" "];
      for (let k = 0; k < 15; k++) if (g[k] === "1") this.r(px + (k % 3) * sc, py + Math.floor(k / 3) * sc, sc, sc, col);
      px += 4 * sc;
    }
  }

  private ctr(s: string | number, cx: number, py: number, sc: number, col: string): void {
    this.txt(s, Math.round(cx - (String(s).length * 4 * sc - sc) / 2), py, sc, col);
  }

  private jersey(cx: number, top: number, i: number, swing: number): void {
    const [col, numCol, trim, num] = JERSEYS[i];
    for (let y = 0; y < 26; y++) {
      const sh = Math.round(swing * (y / 26) * 2);
      if (y < 3) {
        this.r(cx - 7 + sh, top + y, 4, 1, col);
        this.r(cx + 4 + sh, top + y, 4, 1, col);
        continue;
      }
      const a = cx - 9 + sh;
      if (y === 3) {
        this.r(a, top + y, 6, 1, col);
        this.r(a + 12, top + y, 6, 1, col);
        continue;
      }
      this.r(a, top + y, 18, 1, y >= 24 ? trim : col);
      if (y >= 4 && y <= 11) this.r(a, top + y, 2, 1, trim);
    }
    this.ctr(num, cx + Math.round(swing * 1.2), top + 9, 2, numCol);
  }

  /** The hoop, the floor and the ball as a tiny scene, camera following the ball. */
  private scene(x0: number, y0: number, w: number, h: number, bx: number, by: number, trail: Sample[], t: number): void {
    const c = this.c;
    c.save();
    c.beginPath();
    c.rect(x0, y0, w, h);
    c.clip();
    this.r(x0, y0, w, h, "#0a1230");
    const cam = Math.max(w / 2 - 4, Math.min(bx, 200 - w / 2 + 16));
    const sx = (wx: number): number => x0 + wx - cam + w / 2;
    const fl = y0 + h - 8;
    const sy = (wy: number): number => fl - wy;
    for (let k = 0; k < 8; k++) this.r(sx(k * 40 - ((cam * 0.3) % 40)), y0, 1, h - 8, "#0c1638");
    this.r(x0, fl, w, 8, "#a8743c");
    this.r(x0, fl, w, 1, "#c99456");
    for (let k = 0; k < 12; k++) this.r(sx(k * 30), fl + 4, 14, 1, "#6b4423");
    const hx = sx(HOOP_X);
    this.r(hx + 3, sy(30), 2, 30, "#7d84a6");
    this.r(hx - 1, sy(48), 3, 18, "#f4f6fb");
    this.r(hx - 1, sy(42), 3, 1, "#e8392b");
    const shake = t - this.netAt < 500 ? Math.round(Math.sin((t - this.netAt) / 40) * 1.5) : 0;
    for (let k = 0; k < 4; k++) this.r(hx - 12 + (k > 0 ? shake : 0), sy(34) + 1 + k * 2, 11 - k * 2, 1, "#dfe6f2");
    this.r(hx - 12, sy(34), 11, 1, "#e8731f");
    trail.forEach((p, k) => this.r(sx(p.x), sy(p.y), 2, 2, k < trail.length / 2 ? "#7a3a10" : "#e8731f"));
    const px = Math.round(sx(bx));
    const py = Math.round(sy(by));
    this.r(px - 3, fl + 1, 6, 1, "#00000066");
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        if (dx * dx + dy * dy <= 17) this.r(px + dx, py + dy, 1, 1, (dx === 0 || dy === 0) && dx * dx + dy * dy > 3 ? "#7a3a10" : "#e8731f");
      }
    }
    c.restore();
  }

  private live(x0: number, y0: number, w: number, h: number, t: number, ball: { x: number; y: number }, showGoal: boolean): void {
    const tr = this.hist.filter((q) => q.t > (t - this.shotAt) / 1000 - 0.3).filter((_q, i) => i % 2 === 0);
    this.scene(x0, y0, w, h, ball.x, ball.y, this.shotAt ? tr : [], t);
    if (Math.floor(t / 500) % 2) this.r(x0 + 3, y0 + 3, 3, 3, "#e8392b");
    this.txt("LIVE", x0 + 8, y0 + 3, 1, "#fff");
    if (showGoal) {
      this.c.globalAlpha = 0.55;
      this.r(x0, y0, w, h, Math.floor(t / 110) % 2 ? "#ffcf3a" : "#ffffff");
      this.c.globalAlpha = 1;
      this.ctr("GOAL!", x0 + w / 2, y0 + h / 2 - 7, 4, "#c2410c");
    }
  }

  private replay(x0: number, y0: number, w: number, h: number, t: number, since: number): void {
    const g = this.lastGoal;
    if (!g || g.length < 2) return;
    const e = g[0].t + Math.min(g[g.length - 1].t - g[0].t, ((t - since) / 1000) * REPLAY_SPEED);
    let i = 0;
    while (i < g.length - 1 && g[i].t < e) i++;
    const tr = g.filter((q) => q.t <= e && q.t > e - 0.5).filter((_q, k) => k % 2 === 0);
    this.scene(x0, y0, w, h, g[i].x, g[i].y, tr, t);
    this.c.globalAlpha = 0.18;
    for (let j = y0; j < y0 + h; j += 2) this.r(x0, j, w, 1, "#000");
    this.c.globalAlpha = 1;
    if (Math.floor(t / 400) % 2) {
      this.r(x0, y0, 34, 7, "#e8392b");
      this.txt("REPLAY", x0 + 2, y0 + 1, 1, "#fff");
    }
    this.txt("0.5x", x0 + w - 18, y0 + 2, 1, "#ffe070");
  }

  private card(x0: number, y0: number, w: number, h: number): void {
    this.r(x0, y0, w, h, "#0a1230");
    for (let j = y0; j < y0 + h; j += 2) this.r(x0, j, w, 1, "#0c1638");
    this.txt("SCORE", x0 + 10, y0 + 5, 1, "#7fd0ff");
    this.txt("SHOTS", x0 + w - 30, y0 + 5, 1, "#7fd0ff");
    this.ctr(this.score, x0 + w * 0.25, y0 + 13, 5, "#ffcf3a");
    this.ctr(this.shots, x0 + w * 0.75, y0 + 13, 5, "#ffffff");
    this.r(x0 + w / 2, y0 + 5, 1, 36, "#2a2f4a");
    this.txt("LAST 10", x0 + 8, y0 + h - 8, 1, "#9aa1ad");
    this.last10.forEach((v, i) => this.r(x0 + w / 2 - 30 + i * 6, y0 + h - 6, 4, 4, v ? "#3fae5c" : "#e8392b"));
  }

  /**
   * Draws the jerseys and the screen, centred on the wall. top is the top edge of the wall, ballX/floorY/ballY are the real ball in art pixels,
   * hoopX/rimY the ring and side which side of the screen the hoop is on.
   */
  draw(
    c: CanvasRenderingContext2D,
    t: number,
    w: number,
    top: number,
    ball: { x: number; floorY: number; y: number },
    hoop: { x: number; rimY: number; side: "left" | "right" },
    ballR: number,
  ): void {
    this.c = c;
    if (t - this.lastDraw > 800) {
      this.visibleSince = t;
      this.page = "";
    }
    this.lastDraw = t;
    if (t - this.statsAt > 400) {
      this.statsAt = t;
      this.score = getScore();
      this.shots = getShots();
      this.last10 = getLast10();
    }
    // The real ball mapped into the screen's own little world.
    const ringH = Math.max(30, ball.floorY - hoop.rimY);
    const k = 30 / ringH;
    const dist = hoop.side === "right" ? hoop.x - ball.x : ball.x - hoop.x;
    const wx = HOOP_X - 6 - dist * k;
    const wy = 4 + Math.max(0, ball.floorY - ball.y - ballR) * k;
    const el = (t - this.shotAt) / 1000;
    if (this.shotAt && this.shotAt >= this.visibleSince - 50 && el < 5 && t - this.lastSample >= 16 && !this.finalized) {
      this.lastSample = t;
      this.hist.push({ t: el, x: wx, y: wy });
    }
    const goalHere = this.goalAt >= this.visibleSince - 50 && this.goalAt >= this.shotAt;
    if (goalHere && !this.finalized && t - this.goalAt > 600) {
      this.finalized = true;
      const end = (this.goalAt - this.shotAt) / 1000 + 0.6;
      const part = this.hist.filter((q) => q.t <= end && q.t >= end - 2.4);
      if (part.length > 4) this.lastGoal = part;
    }
    const len = this.replayLen();
    const since = t - this.goalAt;
    const shotHere = this.shotAt >= this.visibleSince - 50;
    let page: string;
    let replayFrom = 0;
    if (goalHere && since < 800) page = "goal";
    else if (goalHere && this.lastGoal && since < 800 + len) {
      page = "replay";
      replayFrom = this.goalAt + 800;
    } else if (goalHere && since < 800 + len + 2600) page = "score";
    else if (shotHere && t - this.shotAt < 2400) page = "live";
    else if (shotHere && t - this.shotAt < 5000) page = "score";
    else if (!shotHere && this.lastGoal && t - this.visibleSince < len) {
      page = "replay";
      replayFrom = this.visibleSince;
    } else if (!shotHere && t - this.visibleSince < len + 2200) page = "score";
    else page = ((t - this.visibleSince) / 1000) % 12 > 9.2 ? "score" : "live";
    if (page !== this.page) {
      this.page = page;
      this.pageSince = t;
    }

    // Everything below is drawn at 2x: one screen pixel is 2x2 art pixels.
    const S = 2;
    const cx = Math.round(w / 2 / S);
    const x0 = cx - SCREEN_W / 2;
    const y0 = 16;
    c.save();
    c.translate(0, top);
    c.scale(S, S);
    // Jerseys hang from the roof on both sides.
    [[x0 - 38, 0], [x0 - 20, 1], [x0 + SCREEN_W + 20, 2], [x0 + SCREEN_W + 38, 3]].forEach(([jx, ji], n) => {
      this.r(jx, 0, 1, 16, "#2a2f4a");
      this.jersey(jx, 16, ji, Math.sin(t / (700 + n * 80) + n));
    });
    this.r(x0 + 14, 0, 1, y0 - 2, "#2a2f4a");
    this.r(x0 + SCREEN_W - 15, 0, 1, y0 - 2, "#2a2f4a");
    this.r(x0 - 2, y0 - 2, SCREEN_W + 4, SCREEN_H + 4, "#05060c");
    this.r(x0 - 1, y0 - 1, SCREEN_W + 2, SCREEN_H + 2, "#2a2f4a");
    if (page === "replay") this.replay(x0, y0, SCREEN_W, SCREEN_H, t, replayFrom);
    else if (page === "score") this.card(x0, y0, SCREEN_W, SCREEN_H);
    else this.live(x0, y0, SCREEN_W, SCREEN_H, t, { x: wx, y: wy }, page === "goal");
    const d = t - this.pageSince;
    if (this.pageSince > this.visibleSince + 50 && d < 450) {
      const bx = x0 - 10 + (d / 450) * (SCREEN_W + 20);
      c.save();
      c.beginPath();
      c.rect(x0, y0, SCREEN_W, SCREEN_H);
      c.clip();
      this.r(bx, y0, 10, SCREEN_H, "#ffb257");
      this.r(bx + 10, y0, 3, SCREEN_H, "#ffffff");
      this.r(bx - 4, y0, 4, SCREEN_H, "#c2410c");
      c.restore();
    }
    c.restore();
  }
}
