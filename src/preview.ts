import { makeCourtSprite } from "./court";
import { CROWD_ROW_H, Crowd } from "./crowd";
import { Net } from "./net";
import { settings } from "./settings";
import { BALL_SKINS } from "./skins";
import { BASE_CENTER, type HoopSprite, makeBallFrame, makeHoopSprite, makePoleSprite } from "./sprites";

const W = 300;
const H = 138;
const FLOOR = 112;
const BALL_X = 205;
const FLOOR_REF = 112;
const RIM_REF = 50;

let hoopSp: HoopSprite | null = null;

/** Show another look than the current settings in the preview (a theme you are only looking at). */
let override: { ballSkin: string; courtSkin: string; crowd: string } | null = null;
export function setPreviewOverride(o: { ballSkin: string; courtSkin: string; crowd: string } | null): void {
  override = o;
}

export type CrowdMode = "nocourt" | "off" | "row" | "half" | "full";

/** Options for a preview that shows one crowd choice, with the court sliding in and out like in the game. */
export interface PreviewOptions {
  /** Show this crowd choice (taller picture, like a real screen). Left out: the crowd mode in the settings. */
  mode?: CrowdMode;
  /** The court and crowd come in, stay, and go out again in a loop. */
  slide?: boolean;
  /** Draw once and stop (used for the small pictures of themes). */
  still?: boolean;
  /** Another look than the settings (ball, court, crowd). */
  override?: { ballSkin: string; courtSkin: string; crowd: string };
}

// the loop of a sliding preview, in ms: in, stay, out, a pause (slower than the game so the small picture reads smoothly)
const IN = 800;
const STAY = 2200;
const OUT = 500;
const GAP = 1000;

/** Live preview of the scene (crowd, court, hoop, ball) for the Appearance window. */
export class Preview {
  static readonly W = W;
  static readonly H = H;
  private ctx: CanvasRenderingContext2D;
  private crowd = new Crowd();
  private net: Net | null = null;
  private court: ReturnType<typeof makeCourtSprite> | null = null;
  private courtKey = "";
  private ball: HTMLCanvasElement | null = null;
  private ballKey = "";
  private pole: HTMLCanvasElement | null = null;
  private poleKey = "";

  private hh = H;
  private fl = FLOOR;

  constructor(private cv: HTMLCanvasElement, private opts?: PreviewOptions) {
    // a preview of one crowd choice is taller, like a real screen, so "Half" and "Full" are what they say
    if (opts?.mode) {
      this.hh = 230;
      this.fl = this.hh - 26;
    }
    this.ctx = cv.getContext("2d")!;
    this.ctx.imageSmoothingEnabled = false;
    if (!opts?.mode && !opts?.still) cv.addEventListener("click", () => this.crowd.cheer(performance.now()));
    this.crowd.cheer(performance.now() + 300);
    if (!opts?.still) requestAnimationFrame((t) => this.frame(t));
  }

  /** One picture of the look as a data URL, for the theme and crowd tiles. */
  static still(look: { ballSkin: string; courtSkin: string; crowd: string }): string {
    const cv = document.createElement("canvas");
    cv.width = W;
    cv.height = H;
    const p = new Preview(cv, { still: true, override: look });
    p.draw(performance.now() + 2500);
    return cv.toDataURL();
  }

  private frame(now: number): void {
    if (!this.cv.isConnected) return;
    this.draw(now);
    requestAnimationFrame((t) => this.frame(t));
  }

  private draw(now: number): void {
    const c = this.ctx;
    const H = this.hh;
    const FLOOR = this.fl;
    const RIM_Y = this.fl - (FLOOR_REF - RIM_REF);
    const ov = this.opts?.override ?? override;
    const ballSkin = (ov?.ballSkin ?? settings.ballSkin) as typeof settings.ballSkin;
    const courtSkin = (ov?.courtSkin ?? settings.courtSkin) as typeof settings.courtSkin;
    const mode = this.opts?.mode;
    // a preview of one choice shows it whatever the settings say; the crowd style is the one in use, or the one that was switched off
    const base = (ov?.crowd ?? (settings.crowd === "none" ? settings.crowdBack : settings.crowd)) as typeof settings.crowd;
    const noCourt = mode === "nocourt";
    const crowdStyle = (mode ? (mode === "off" || noCourt ? "none" : base) : (ov?.crowd ?? settings.crowd)) as typeof settings.crowd;
    const full = mode ? mode === "full" : settings.arenaFill;
    const row = mode ? mode === "row" : settings.crowdRow && !full;
    const half = mode ? mode === "half" : !full && !row;
    const fill = full || half;
    // 1 while the court is in; during the slide it rises from below (the same easing as the game)
    let p = 1;
    if (this.opts?.slide) {
      const t = now % (IN + STAY + OUT + GAP);
      p = t < IN ? t / IN : t < IN + STAY ? 1 : t < IN + STAY + OUT ? 1 - (t - IN - STAY) / OUT : 0;
    }
    hoopSp ??= makeHoopSprite("left");
    const sp = hoopSp;
    if (this.courtKey !== courtSkin) {
      this.court = makeCourtSprite("left", W, courtSkin);
      this.courtKey = courtSkin;
    }
    if (this.ballKey !== ballSkin + crowdStyle + fill) {
      const s = BALL_SKINS.find((k) => k.id === ballSkin) ?? BALL_SKINS[0];
      this.ball = makeBallFrame(s.pal, s.seam, crowdStyle === "arena" ? Math.max(-0.8, Math.min(0.8, (W / 2 - BALL_X) / (this.crowd.keyH(FLOOR, fill) * 1.6))) : -0.5);
      this.ballKey = ballSkin + crowdStyle + fill;
    }
    const bottom = settings.court && !noCourt ? FLOOR + BASE_CENTER[settings.baseSkin] - 2 : H;
    const y0 = Math.max(RIM_Y, sp.rimY + 4) - sp.rimY;
    const poleKey = settings.baseSkin + bottom;
    if (this.poleKey !== poleKey) {
      this.pole = makePoleSprite("left", bottom - (y0 - sp.shiftY) + 2, settings.baseSkin);
      this.poleKey = poleKey;
      this.net = new Net(sp.netGeom, 0, y0);
    }
    c.clearRect(0, 0, W, H);
    c.fillStyle = "#c9d3e3";
    c.fillRect(0, 0, W, H);
    if (mode) {
      // the crowd choices are shown on the user's own kind of desktop (Mac or Windows)
      const R = (x: number, y: number, w: number, h: number, col: string): void => {
        c.fillStyle = col;
        c.fillRect(Math.round(x * W), Math.round(y * H), Math.max(1, Math.round(w * W)), Math.max(1, Math.round(h * H)));
      };
      const win = (x: number, y: number, w: number, h: number, bar: string, body: string, dots: boolean): void => {
        R(x - 0.006, y - 0.008, w + 0.012, h + 0.016, "#111");
        R(x, y, w, h, body);
        R(x, y, w, h * 0.16, bar);
        if (dots) [["#e8392b", 0], ["#f6c744", 1], ["#5de06a", 2]].forEach(([col, i]) => R(x + 0.015 + (i as number) * 0.03, y + h * 0.05, 0.02, h * 0.07, col as string));
        R(x + 0.03, y + h * 0.3, w * 0.8, h * 0.05, "#b9bfc9");
        R(x + 0.03, y + h * 0.45, w * 0.55, h * 0.05, "#b9bfc9");
      };
      if (/Mac/i.test(navigator.platform)) {
        R(0, 0, 1, 1, "#3b5b8c");
        R(0, 0, 1, 0.09, "rgba(20,22,32,0.6)");
        R(0.02, 0.025, 0.025, 0.04, "#fff");
        R(0.07, 0.03, 0.09, 0.03, "#fff");
        R(0.17, 0.03, 0.05, 0.03, "#fff");
        R(0.8, 0.03, 0.15, 0.03, "#fff");
        win(0.3, 0.2, 0.5, 0.42, "#cfd4dc", "#e9ecf1", true);
        R(0.25, 0.86, 0.5, 0.11, "rgba(255,255,255,0.35)");
        ["#f6c744", "#35d4ff", "#5de06a", "#e8392b"].forEach((col, i) => R(0.32 + i * 0.1, 0.89, 0.05, 0.065, col));
      } else {
        R(0, 0, 1, 1, "#1f6f8b");
        [["#f6c744", 0.08], ["#e9ecf1", 0.28], ["#9aa3b2", 0.48]].forEach(([col, y]) => {
          R(0.05, y as number, 0.07, 0.1, col as string);
          R(0.05, (y as number) + 0.13, 0.07, 0.03, "rgba(255,255,255,0.8)");
        });
        win(0.34, 0.12, 0.45, 0.46, "#cfd4dc", "rgba(240,242,246,0.9)", false);
        R(0, 0.89, 1, 0.11, "rgba(20,22,30,0.88)");
        ["#35d4ff", "#e9ecf1", "#f6c744"].forEach((col, i) => R(0.02 + i * 0.05, 0.915, 0.035, 0.06, col));
        R(0.9, 0.925, 0.07, 0.04, "#fff");
      }
    }
    const e = Math.pow(1 - p, 2.2);
    if (!noCourt && p > 0 && (settings.court || this.opts) && this.court) {
      const top = FLOOR - Math.round(this.court.cy) + Math.round(e * (H - (FLOOR - this.court.cy)));
      this.crowd.setBall(BALL_X, FLOOR + e * H, FLOOR - 10.5);
      const clipTop = row ? top + 1 - CROWD_ROW_H : half ? Math.min(top + 1, Math.round(H / 2)) : 0;
      const clipped = (row || half) && crowdStyle !== "none";
      if (clipped) {
        c.save();
        c.beginPath();
        c.rect(0, clipTop, W, top + 1 - clipTop);
        c.clip();
      }
      this.crowd.draw(c, crowdStyle, now, W, top + 1, fill);
      if (clipped) c.restore();
      c.drawImage(this.court.canvas, 0, top);
      if (crowdStyle === "arena") this.crowd.arenaFloor(c, now, W, top, this.court.h);
    }
    // the hoop slides in from the side with the court
    c.save();
    c.translate(-Math.round(e * (sp.w + 8)), 0);
    c.drawImage(this.pole!, -sp.shiftX, y0 - sp.shiftY);
    c.drawImage(sp.canvas, 0, y0);
    this.net?.draw(c, "back");
    c.restore();
    const bx = Math.round(BALL_X - 11.5);
    const by = Math.round(FLOOR - 10.5 - 11.5);
    const lit = settings.court && crowdStyle === "arena";
    const tl = (BALL_X - W / 2) / this.crowd.keyH(FLOOR, fill);
    const srx = 9 + (lit ? 10 * Math.abs(tl) * 1.3 : 0);
    const off = lit ? Math.round(10 * tl * 0.8) + Math.sign(tl) * 3 : 0;
    for (let x = -Math.ceil(srx); x <= Math.ceil(srx) && !lit; x++) {
      for (let y = -3; y <= 3; y++) {
        const q = (x / srx) ** 2 + (y / (lit ? 3 : 2.4)) ** 2;
        if (q > 1) continue;
        c.fillStyle = lit ? `rgba(6,4,18,${q < 0.45 ? 0.62 : 0.38})` : "rgba(8,4,24,0.3)";
        c.fillRect(BALL_X + x + off, FLOOR - 1 + y, 1, 1);
      }
    }
    if (mode) c.globalAlpha = 0.5 + 0.5 * p;
    if (this.ball) c.drawImage(this.ball, bx, by);
    c.globalAlpha = 1;
    c.save();
    c.translate(-Math.round(e * (sp.w + 8)), 0);
    this.net?.draw(c, "front");
    c.drawImage(sp.front, 0, y0);
    c.restore();
  }
}
