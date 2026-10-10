import { makeCourtSprite } from "./court";
import { Crowd } from "./crowd";
import { Net } from "./net";
import { settings } from "./settings";
import { BALL_SKINS } from "./skins";
import { BASE_CENTER, type HoopSprite, makeBallFrame, makeHoopSprite, makePoleSprite } from "./sprites";

const W = 300;
const H = 138;
const FLOOR = 112;
const RIM_Y = 50;
const BALL_X = 205;

let hoopSp: HoopSprite | null = null;

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

  constructor(private cv: HTMLCanvasElement) {
    this.ctx = cv.getContext("2d")!;
    this.ctx.imageSmoothingEnabled = false;
    cv.addEventListener("click", () => this.crowd.cheer(performance.now()));
    this.crowd.cheer(performance.now() + 300);
    requestAnimationFrame((t) => this.frame(t));
  }

  private frame(now: number): void {
    if (!this.cv.isConnected) return;
    this.draw(now);
    requestAnimationFrame((t) => this.frame(t));
  }

  private draw(now: number): void {
    const c = this.ctx;
    hoopSp ??= makeHoopSprite("left");
    const sp = hoopSp;
    if (this.courtKey !== settings.courtSkin) {
      this.court = makeCourtSprite("left", W, settings.courtSkin);
      this.courtKey = settings.courtSkin;
    }
    if (this.ballKey !== settings.ballSkin + settings.crowd + settings.arenaFill) {
      const s = BALL_SKINS.find((k) => k.id === settings.ballSkin) ?? BALL_SKINS[0];
      this.ball = makeBallFrame(s.pal, s.seam, settings.crowd === "arena" ? Math.max(-0.8, Math.min(0.8, (W / 2 - BALL_X) / (this.crowd.keyH(FLOOR, settings.arenaFill) * 1.6))) : -0.5);
      this.ballKey = settings.ballSkin + settings.crowd + settings.arenaFill;
    }
    const bottom = settings.court ? FLOOR + BASE_CENTER[settings.baseSkin] - 2 : H;
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
    if (settings.court && this.court) {
      const top = FLOOR - Math.round(this.court.cy);
      this.crowd.setBall(BALL_X, FLOOR, FLOOR - 10.5);
      this.crowd.draw(c, settings.crowd, now, W, top + 1, settings.arenaFill);
      c.drawImage(this.court.canvas, 0, top);
      if (settings.crowd === "arena") this.crowd.arenaFloor(c, now, W, top, this.court.h);
    }
    c.drawImage(this.pole!, -sp.shiftX, y0 - sp.shiftY);
    c.drawImage(sp.canvas, 0, y0);
    this.net?.draw(c, "back");
    const bx = Math.round(BALL_X - 11.5);
    const by = Math.round(FLOOR - 10.5 - 11.5);
    const lit = settings.court && settings.crowd === "arena";
    const tl = (BALL_X - W / 2) / this.crowd.keyH(FLOOR, settings.arenaFill);
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
    if (this.ball) c.drawImage(this.ball, bx, by);
    this.net?.draw(c, "front");
    c.drawImage(sp.front, 0, y0);
  }
}
