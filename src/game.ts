import { MAXPULL, drawAim, geff, maxSpeed } from "./aim";
import { isRegistered, register, unregister } from "@tauri-apps/plugin-global-shortcut";
import { play } from "./audio";
import { BallFire } from "./fire";
import { type Achievement, getStats, recordGoal, recordHeroDown, recordMiss, recordThrow } from "./stats";
import { Confetti } from "./confetti";
import { Crowd, CROWD_ROW_H } from "./crowd";
import { clamp, layer, rnd, text, textWidth } from "./draw";
import { type CourtSprite, makeCourtSprite } from "./court";
import { BALL_SKINS } from "./skins";
import { Milestone } from "./milestone";
import { NET_PARAMS, Net } from "./net";
import {
  type Handoff,
  type MonitorInfo,
  type Rect,
  activateOverlay,
  sendHandoff,
  setCapture,
  setHitRegions,
} from "./ipc";
import { addShot, getScore, isOnboarded, pushLast10, reloadSettings, resetMatch, setScore, setSetting, settings } from "./settings";
import { themeById } from "./themes";
import { achievementsDone, drawTrail, trailById, trailOwned, trailsUnlockedBetween, type TrailPoint } from "./trails";
import { BALL_FRAMES, BALL_R, BALL_SPRITE_SIZE, type HoopSprite, BASE_CENTER, OLD_BOARD, makeBallFrames, makeHoopSprite, makePoleSprite } from "./sprites";
import { queueLeaderboardScoreSync } from "./leaderboardSync";
import type { UI } from "./ui";
import type { OnlineMatch, OpponentBall } from "./onlineMatch";

interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  moving: boolean;
  gs: number;
  t: number;
  scored: boolean;
  postGoal: boolean;
  kicked: boolean;
  entering: boolean;
  ang: number;
  noScore: boolean;
}

interface Hoop {
  sprite: HoopSprite;
  side: "left" | "right";
  x0: number;
  y0: number;
  rimY: number;
  phase: "in" | "shown" | "out";
  p: number;
  net: Net;
  off: number;
  vel: number;
  pole: HTMLCanvasElement;
  poleX: number;
  poleY: number;
  poleBox: [number, number][];
}

interface Drag {
  gx: number;
  gy: number;
  lx: number;
  ly: number;
  power: number;
  move: boolean;
  tx: number;
  ty: number;
}

const SUB = 4;
const isMilestone = (n: number): boolean => n === 25 || n === 50 || (n >= 100 && n % 100 === 0);
const TIME_SCALE = 1.25;
/** The other player's ball is drawn this many ms behind, so there are always two reports to glide between. */
const GHOST_DELAY = 90;
const SLIDE_GRAB = 1.2;
const TOUCH_WEB = import.meta.env.VITE_TARGET === "web" && window.matchMedia("(pointer: coarse)").matches;
/** On a touch screen the ball never rests closer to an edge than this (in art pixels), so there is room to pull it back. */
const EDGE_ROOM = 38;
const HOLD_K = 0.16;
const HOLD_DAMP = 0.8;
const THROW_CAP = 8;
const THROW_GAIN = 0.55;
const STEP_MS = 1000 / 60;

export class Game {
  readonly cv: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  S = 3;
  artW = 0;
  artH = 0;
  floorY = 0;
  vmax = 9;
  active = false;
  ui!: UI;

  private ball: Ball = {
    x: 0, y: 0, vx: 0, vy: 0, moving: false, gs: 1, t: 999,
    scored: false, postGoal: false, kicked: false, entering: false, ang: 0, noScore: false,
  };
  private hoop: Hoop | null = null;
  private drag: Drag | null = null;
  private shot = false;
  private hideAt: number | null = null;
  private bubble: { t0: number; cx: number; top: number } | null = null;
  private confetti = new Confetti();
  private milestone = new Milestone();
  private fire = new BallFire();
  private fireAt = 0;
  private burning = getStats().streak >= 3;
  /** The flames are lit: the streak is alive and the scene is up. */
  private fireOn = false;
  /** This shot has already counted as a goal or a miss. */
  private shotResolved = false;
  private sceneWasUp = false;
  private ballFrames = this.buildBall();
  private lightFrames = new Map<number, HTMLCanvasElement[]>();
  private crowd = new Crowd();
  private spR = makeHoopSprite("right");
  private spL = makeHoopSprite("left");
  // The ring keeps the spot it had with the small board, so the big board is what runs off the edge.
  private refR = makeHoopSprite("right", OLD_BOARD);
  private refL = makeHoopSprite("left", OLD_BOARD);
  private courtL!: CourtSprite;
  private courtR!: CourtSprite;
  private running = false;
  private last = 0;
  private acc = 0;
  private lastHit = "";
  private introDone = false;
  private onlineMatch: OnlineMatch | null = null;
  /** The other player's ball in Speedball, drawn in blue. HORSE and 21 move the shared ball instead. */
  private ghost: { x: number; y: number; ang: number } | null = null;
  private ghostUntil = 0;
  private ghostFrames: HTMLCanvasElement[] | null = null;
  /** The positions the other player's ball has been reported at, with the time they arrived: the ghost is drawn a moment in the past, between two of them, so it moves smoothly. */
  private ghostBuf: { t: number; x: number; y: number; ang: number }[] = [];
  private sharedBallTarget: { x: number; y: number; ang: number; until: number } | null = null;
  private sharedSamples: { t: number; x: number; y: number; ang: number }[] = [];
  private ballSentAt = 0;
  /** Where the ball has been lately, for the trail behind it. */
  private trailHist: TrailPoint[] = [];
  /** When the hoop moves to a new place after a goal or a miss in an online match (0 = not planned). */
  private hoopSwapAt = 0;
  /** Shared online turn-game hoop sequence. Both clients derive the same side and height from the match seed. */
  private onlineHoopRound = 0;
  /** The court stays fully up while a new hoop slides in. */
  private keepCourt = false;
  /** Your own look, put back after an online match that used the court you both picked. */
  private savedLook: { ball: typeof settings.ballSkin; court: typeof settings.courtSkin; crowd: typeof settings.crowd } | null = null;

  /** The online match being played, or null. */
  get online(): OnlineMatch | null {
    return this.onlineMatch;
  }

  constructor(
    cv: HTMLCanvasElement,
    private me: MonitorInfo,
    private monitors: MonitorInfo[],
  ) {
    this.cv = cv;
    this.ctx = cv.getContext("2d")!;
    this.ctx.imageSmoothingEnabled = false;
    cv.addEventListener("pointerdown", (e) => this.onDown(e));
    cv.addEventListener("pointermove", (e) => this.onMove(e));
    cv.addEventListener("pointerup", (e) => this.onUp(e));
    cv.addEventListener("pointercancel", (e) => this.onUp(e));
    cv.addEventListener("lostpointercapture", () => this.cancelDrag());
    window.addEventListener("blur", () => this.cancelDrag());
    cv.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      if (!this.active) return;
      const p = this.toArt(e);
      if (Math.hypot(p.x - this.ball.x, p.y - this.ball.y) <= BALL_R + 10) this.ui.toggleMenu();
    });
  }

  /** The crowd is laid out for the whole screen, except in "Row" (and Half is the lower half of that). */
  private crowdFill(): boolean {
    return settings.arenaFill || !settings.crowdRow;
  }

  private cssSize(): { w: number; h: number } {
    const w = window.innerWidth || this.me.w / this.me.scale;
    const h = window.innerHeight || this.me.h / this.me.scale;
    return { w, h };
  }

  private setupCanvas(): void {
    const { w, h } = this.cssSize();
    this.S = settings.ballScale;
    this.artW = Math.floor(w / this.S);
    this.artH = Math.floor(h / this.S);
    this.cv.width = this.artW;
    this.cv.height = this.artH;
    this.cv.style.width = this.artW * this.S + "px";
    this.cv.style.height = this.artH * this.S + "px";
    this.ctx.imageSmoothingEnabled = false;
    const dock = Math.ceil(this.me.bottom_inset / this.S) + 2;
    this.floorY = this.artH - Math.max(dock, MAXPULL + 8);
    this.vmax = maxSpeed(this.artW);
    this.confetti.resize(this.artW, this.artH);
    this.milestone.resize(this.artW, this.artH);
    this.buildCourts();
  }

  rescale(): void {
    if (!this.active) return;
    const old = this.S;
    this.setupCanvas();
    const r = old / this.S;
    const b = this.ball;
    b.x *= r;
    b.y *= r;
    b.vx *= r;
    b.vy *= r;
    if (!b.moving) b.y = this.floorY - BALL_R;
    this.hoop = null;
    this.start();
    this.syncHit();
  }

  ballCss(): { x: number; y: number; r: number } {
    return { x: this.ball.x * this.S, y: this.ball.y * this.S, r: BALL_R * this.S };
  }

  viewport(): { w: number; h: number } {
    return { w: this.artW * this.S, h: this.artH * this.S };
  }

  floorCss(): number {
    return this.floorY * this.S;
  }

  activate(): void {
    this.active = true;
    reloadSettings();
    this.setupCanvas();
  }

  deactivate(): void {
    this.active = false;
    this.hoop = null;
    this.syncEsc();
    this.drag = null;
    this.stopBeat();
    this.shot = false;
    this.bubble = null;
    this.milestone.stop();
    this.ball.moving = false;
    this.ui.close();
    void setHitRegions([]);
    void setCapture(false);
    this.ctx.clearRect(0, 0, this.artW, this.artH);
  }

  intro(): void {
    this.onlineMatch = null;
    this.restoreLook();
    this.activate();
    const b = this.ball;
    b.gs = 1;
    b.t = 999;
    b.scored = false;
    b.postGoal = false;
    b.kicked = false;
    const left = Math.random() < 0.5;
    b.x = left ? -15 : this.artW + 15;
    b.y = this.floorY - rnd(30, 90);
    b.vx = (left ? 1 : -1) * rnd(5, 7);
    b.vy = -rnd(2, 4);
    b.entering = true;
    b.moving = true;
    this.introDone = false;
    this.start();
  }

  /** Notes where the other player's ball is now. */
  private pushGhost(x: number, y: number, ang: number): void {
    const now = performance.now();
    const buf = this.ghostBuf;
    // always inside the screen and above the floor
    x = clamp(x, BALL_R, this.artW - BALL_R);
    y = Math.min(y, this.floorY - BALL_R);
    // a long pause (a new shot): do not glide across it
    if (buf.length && now - buf[buf.length - 1].t > 400) buf.length = 0;
    buf.push({ t: now, x, y, ang });
    if (buf.length > 24) buf.shift();
    this.ghost = { x, y, ang };
  }

  private ballNx(): number {
    return clamp((this.ball.x - BALL_R) / Math.max(1, this.artW - BALL_R * 2), 0, 1);
  }

  private xFromPeer(nx: number): number {
    return BALL_R + clamp(nx, 0, 1) * Math.max(1, this.artW - BALL_R * 2);
  }

  private ballNy(): number {
    return clamp((this.ball.y - BALL_R) / Math.max(1, this.floorY - BALL_R * 2), 0, 1);
  }

  private yFromPeer(p: { ny?: number; h?: number }): number {
    if (typeof p.ny === "number") return BALL_R + clamp(p.ny, 0, 1) * Math.max(1, this.floorY - BALL_R * 2);
    return this.floorY - (p.h ?? 0);
  }

  private sendFreeBall(): void {
    const b = this.ball;
    this.onlineMatch?.sendBall({ kind: "free", nx: this.ballNx(), ny: this.ballNy(), ang: b.ang });
  }

  /** Turn games render only the shared ball; discard every leftover second-ball representation. */
  private clearRemoteBallVisuals(): void {
    this.ghost = null;
    this.ghostBuf.length = 0;
    this.ghostUntil = 0;
  }

  /** The other player's ball. Speedball draws a second ghost ball; HORSE and 21 move the shared ball itself. */
  opponentBall(p: OpponentBall): void {
    const m = this.onlineMatch;
    if (!m || !this.active) return;
    if (p.kind === "free") {
      if (m.game !== "speed") {
        this.clearRemoteBallVisuals();
        this.sharedBallTarget = {
          x: this.xFromPeer(p.nx),
          y: clamp(this.yFromPeer(p), BALL_R, this.floorY - BALL_R),
          ang: p.ang,
          until: performance.now() + 900,
        };
        this.sharedSamples.push({ t: performance.now(), ...this.sharedBallTarget });
        if (this.sharedSamples.length > 32) this.sharedSamples.shift();
        this.start();
        return;
      }
      this.pushGhost(this.xFromPeer(p.nx), this.yFromPeer(p), p.ang);
      // Speedball: always there. HORSE and 21: there while it is their ball, kept up by their resting reports
      this.ghostUntil = m.game === "speed" ? Infinity : performance.now() + 1200;
      this.start();
      return;
    }
    if (m.game === "speed") return;
    this.clearRemoteBallVisuals();
    // your hoop stays where it is; their ball is mirrored if their hoop was on the other side
    if (!this.hoop || this.hoop.phase === "out") this.showHoop(p.side, p.rimH);
    const h = this.hoop;
    if (!h) return;
    const mir = h.side === p.side ? 1 : -1;
    // their rim can be higher or lower than yours: stretch the height so their ball rests on your floor and passes through your rim
    const myRimH = this.floorY - h.rimY;
    const k = clamp((myRimH - BALL_R) / Math.max(20, p.rimH - BALL_R), 0.4, 2.5);
    this.sharedBallTarget = {
      x: clamp(h.x0 + h.sprite.rimCx + mir * p.dx, BALL_R, this.artW - BALL_R),
      y: clamp(h.rimY + p.dy * k, BALL_R, this.floorY - BALL_R),
      ang: p.ang,
      until: performance.now() + 900,
    };
    this.hideAt = null;
    this.start();
  }

  /** Where the ghost is drawn at this moment: a short while in the past, between the two reports around that time. */
  private ghostNow(now: number): { x: number; y: number; ang: number } | null {
    const buf = this.ghostBuf;
    if (!buf.length) return this.ghost;
    const rt = now - GHOST_DELAY;
    if (buf.length === 1 || rt <= buf[0].t) return buf[0];
    const last = buf[buf.length - 1];
    if (rt >= last.t) {
      // past the newest report: carry on in the direction it was going, for a moment
      const prev = buf[buf.length - 2];
      const span = Math.max(1, last.t - prev.t);
      const dt = Math.min(rt - last.t, 120);
      return { x: last.x + ((last.x - prev.x) / span) * dt, y: last.y + ((last.y - prev.y) / span) * dt, ang: last.ang + ((last.ang - prev.ang) / span) * dt };
    }
    for (let i = buf.length - 1; i > 0; i--) {
      const a = buf[i - 1];
      const c = buf[i];
      if (a.t <= rt && rt <= c.t) {
        const k = (rt - a.t) / Math.max(1, c.t - a.t);
        return { x: a.x + (c.x - a.x) * k, y: a.y + (c.y - a.y) * k, ang: a.ang + (c.ang - a.ang) * k };
      }
    }
    return last;
  }

  /** The other player has started a shot. */
  opponentShotStart(): void {
    if (this.onlineMatch?.game !== "speed") {
      this.clearRemoteBallVisuals();
      this.sharedBallTarget = null;
      this.sharedSamples.length = 0;
      this.ball.moving = false;
      this.ball.vx = this.ball.vy = 0;
      this.shot = false;
      this.nudgeX = null;
    }
    play("shoot", 0.55);
    this.start();
  }

  /** The other player's shot is over: the ball stays a moment, then the hoop goes. */
  opponentShotEnd(goal: boolean): void {
    if (goal) {
      play("swish", 0.75);
      play("swoosh2", 0.45);
      play("cheer", 0.9);
    }
    if (this.onlineMatch?.game === "speed") return;
    if (!goal && this.burning) play("extinguish");
    this.ghostUntil = performance.now() + 600;
    this.hideAt = performance.now() + 1500;
    this.start();
  }

  /** Redraws now (the online scoreboard changed). */
  refresh(): void {
    const m = this.onlineMatch;
    if (m && m.game !== "speed") {
      const lit = (m.turn === "me" ? m.streakMe : m.streakOpp) >= 3;
      if (lit !== this.burning) {
        this.burning = lit;
        this.fireOn = lit;
        this.fire = new BallFire();
        this.fire.mode = settings.fireStyle;
        if (lit) {
          this.fire.relight();
          const streak = m.turn === "me" ? m.streakMe : m.streakOpp;
          if (streak === 3 && (this.shot || m.waitingForPeer)) play("ignite");
        }
      }
    }
    this.start();
  }

  /** Leaves the online match and goes back to the normal game. */
  endOnlineMatch(): void {
    this.onlineMatch?.leave();
    this.onlineMatch = null;
    this.clearRemoteBallVisuals();
    this.sharedBallTarget = null;
    this.sharedSamples.length = 0;
    this.burning = getStats().streak >= 3;
    this.fireOn = false;
    this.fire = new BallFire();
    this.restoreLook();
    this.ui.close(true);
    this.start();
  }

  /** The court the players picked for the match (Street, Gym or Arena): both see the same look, and yours is put back afterwards. */
  private applyMatchCourt(court: string): void {
    const t = themeById(court.toLowerCase());
    if (!this.savedLook) this.savedLook = { ball: settings.ballSkin, court: settings.courtSkin, crowd: settings.crowd };
    setSetting("ballSkin", t.ball);
    setSetting("courtSkin", t.court);
    setSetting("crowd", t.crowd);
  }

  private restoreLook(): void {
    const l = this.savedLook;
    this.savedLook = null;
    if (!l) return;
    setSetting("ballSkin", l.ball);
    setSetting("courtSkin", l.court);
    setSetting("crowd", l.crowd);
  }

  startOnlineMatch(match: OnlineMatch): void {
    this.onlineMatch = match;
    this.applyMatchCourt(match.court);
    this.activate();
    this.ui.close(true);
    const b = this.ball;
    b.gs = 1;
    b.t = 999;
    b.scored = false;
    b.postGoal = false;
    b.kicked = false;
    b.entering = false;
    b.moving = false;
    b.vx = 0;
    b.vy = 0;
    b.x = Math.round(this.artW * 0.32);
    b.y = this.floorY - BALL_R;
    this.shot = false;
    this.shotResolved = false;
    this.drag = null;
    this.hoop = null;
    this.hideAt = null;
    this.bubble = null;
    this.introDone = true;
    this.clearRemoteBallVisuals();
    this.ghost = match.game === "speed" ? { x: this.artW * 0.7, y: this.floorY - BALL_R, ang: 0 } : null;
    this.sharedBallTarget = null;
    this.sharedSamples.length = 0;
    this.nudgeX = null;
    this.hoopSwapAt = 0;
    this.burning = false;
    this.fireOn = false;
    this.fire = new BallFire();
    this.ghostUntil = Infinity;
    this.showHoop();
    this.start();
    this.syncHit();
  }

  receive(h: Handoff): void {
    this.activate();
    const k = this.S * this.me.scale;
    const b = this.ball;
    b.x = (h.gx - this.me.x) / k;
    b.y = (h.gy - this.me.y) / k;
    b.vx = h.vx / k;
    b.vy = h.vy / k;
    b.gs = h.gs;
    b.t = h.t;
    b.postGoal = h.postGoal;
    b.kicked = false;
    b.scored = false;
    b.moving = true;
    b.entering = true;
    this.shot = h.shot;
    this.introDone = true;
    if (h.shot) this.showHoop();
    this.start();
  }

  private toArt(e: PointerEvent | MouseEvent): { x: number; y: number } {
    return { x: e.clientX / this.S, y: e.clientY / this.S };
  }

  private beat = 0;
  private slowSlide = false;
  private airborne = false;
  private floorHit = false;
  private gasped = false;
  private rimTouched = false;
  private boardTouched = false;
  private shotFar = false;
  private gaspAt = 0;
  /** How solid the ball is drawn: it turns see-through while it rests, so what is behind it shows. */
  private ballAlpha = 1;
  private lastGasp = -1e9;
  private bounces = 0;

  private stopBeat(): void {
    clearInterval(this.beat);
    this.beat = 0;
  }

  private holdTimer = 0;

  private clearHold(): void {
    if (this.holdTimer) window.clearTimeout(this.holdTimer);
    this.holdTimer = 0;
  }

  private cancelDrag(): void {
    this.clearHold();
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    this.stopBeat();
    void setCapture(false);
    if (d.move) {
      const b = this.ball;
      this.capThrow();
      b.gs = 1;
      b.t = 999;
      b.moving = true;
      this.shot = false;
    } else if (this.hoop && !this.onlineMatch) {
      this.hoop.phase = "out";
    }
    this.start();
  }

  /** Ball frames lit from the key light: the highlight and shading move with the ball's position. */
  private framesFor(lit: boolean, x: number): HTMLCanvasElement[] {
    if (!lit) return this.ballFrames;
    const step = Math.max(-4, Math.min(4, Math.round(((this.artW / 2 - x) / (this.crowd.keyH(this.floorY, this.crowdFill()) * 1.6)) * 5)));
    let f = this.lightFrames.get(step);
    if (!f) {
      const s = BALL_SKINS.find((k) => k.id === settings.ballSkin) ?? BALL_SKINS[0];
      f = makeBallFrames(s.pal, s.seam, step / 5);
      this.lightFrames.set(step, f);
    }
    return f;
  }

  private buildBall(): HTMLCanvasElement[] {
    const s = BALL_SKINS.find((k) => k.id === settings.ballSkin) ?? BALL_SKINS[0];
    return makeBallFrames(s.pal, s.seam);
  }

  private buildCourts(): void {
    this.courtL = makeCourtSprite("left", this.artW, settings.courtSkin);
    this.courtR = makeCourtSprite("right", this.artW, settings.courtSkin);
  }

  applyCosmetics(): void {
    this.ballFrames = this.buildBall();
    this.lightFrames.clear();
    if (this.artW > 0) this.buildCourts();
    this.start();
  }

  /** After a miss, a click anywhere on the screen puts the court, crowd and hoop away. */
  private canDismiss(): boolean {
    const h = this.hoop;
    return !this.onlineMatch && !!h && h.phase === "shown" && !this.drag && this.ui.view === "none" && (!this.ball.moving || this.floorHit);
  }

  /** Esc closes the court when it is set to stay open. It is only a global shortcut while the court is up. */
  private escOn = false;

  private syncEsc(): void {
    const want = settings.stayOpen && !!this.hoop && this.hoop.phase !== "out" && this.active;
    if (want === this.escOn) return;
    this.escOn = want;
    if (want) {
      void isRegistered("Escape")
        .then((on) => (on ? undefined : register("Escape", (e) => e.state === "Pressed" && this.dismissHoop())))
        .catch(() => undefined);
    } else {
      void unregister("Escape").catch(() => undefined);
    }
  }

  private dismissHoop(): void {
    const h = this.hoop;
    if (!h || h.phase !== "shown") return;
    h.phase = "out";
    this.hideAt = null;
    this.syncHit();
    this.start();
  }

  private canGrabSliding(): boolean {
    const b = this.ball;
    return b.y >= this.floorY - BALL_R - 0.5 && Math.abs(b.vy) < 0.3 && Math.abs(b.vx) < SLIDE_GRAB;
  }

  private onDown(e: PointerEvent): void {
    if (!this.active || e.button !== 0) return;
    const p = this.toArt(e);
    const onBall = Math.hypot(p.x - this.ball.x, p.y - this.ball.y) <= BALL_R + 5;
    if (this.canDismiss() && (!onBall || (this.ball.moving && !this.canGrabSliding()))) {
      this.hoop!.phase = "out";
      this.hideAt = null;
      this.syncHit();
      this.start();
      return;
    }
    if ((this.ball.moving && !this.canGrabSliding()) || this.ui.view !== "none") return;
    if (!onBall) return;
    // online: it can be the other player's turn
    if (this.onlineMatch && !this.onlineMatch.canShoot()) {
      this.ui.render();
      return;
    }
    if (this.ball.moving) {
      this.ball.moving = false;
      this.ball.vx = 0;
      this.ball.vy = 0;
      this.shot = false;
      this.slowSlide = false;
    }
    this.drag = { gx: e.clientX, gy: e.clientY, lx: 0, ly: 0, power: 0, move: e.shiftKey, tx: this.ball.x, ty: this.ball.y };
    this.cv.setPointerCapture(e.pointerId);
    this.clearHold();
    if (e.pointerType === "touch") {
      // No right-click on a phone: pressing and holding the ball opens the menu.
      this.holdTimer = window.setTimeout(() => {
        this.holdTimer = 0;
        if (this.drag && Math.hypot(this.drag.lx, this.drag.ly) < 6) {
          this.cancelDrag();
          this.ui.toggleMenu();
        }
      }, 550);
    }
    void setCapture(true);
    this.stopBeat();
    this.beat = window.setInterval(() => void setCapture(true), 1000);
    if (!this.drag.move) {
      this.showHoop();
      play("stretch");
    }
    this.start();
  }

  private onMove(e: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    if (d.move) {
      d.tx = clamp(e.clientX / this.S, BALL_R, this.artW - BALL_R);
      d.ty = clamp(e.clientY / this.S, BALL_R, this.floorY - BALL_R);
      this.start();
      return;
    }
    let dx = (e.clientX - d.gx) / this.S;
    let dy = (e.clientY - d.gy) / this.S;
    const l = Math.hypot(dx, dy);
    if (l > MAXPULL) {
      dx *= MAXPULL / l;
      dy *= MAXPULL / l;
    }
    d.lx = dx;
    d.ly = dy;
    d.power = clamp(Math.hypot(dx, dy) / this.fullPull(d, dx, dy), 0, 1);
    this.start();
  }

  private onUp(e: PointerEvent): void {
    this.clearHold();
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    this.stopBeat();
    if (this.cv.hasPointerCapture(e.pointerId)) this.cv.releasePointerCapture(e.pointerId);
    void setCapture(false);
    const l = Math.hypot(d.lx, d.ly);
    const b = this.ball;
    if (d.move) {
      this.releaseMoved(e);
      return;
    }
    if (l > 3) {
      b.vx = (-d.lx / l) * d.power * this.vmax;
      b.vy = (-d.ly / l) * d.power * this.vmax;
      b.gs = Math.abs(d.ly / l);
      b.t = 0;
      b.scored = false;
      b.noScore = false;
      b.postGoal = false;
      b.kicked = false;
      b.entering = false;
      this.gasped = false;
      this.gaspAt = 0;
      this.rimTouched = false;
      this.boardTouched = false;
      const ringX = this.hoop ? this.hoop.x0 + this.hoop.sprite.rimCx : this.artW / 2;
      this.shotFar = Math.abs(b.x - ringX) > this.artW * 0.55;
      b.moving = true;
      this.slowSlide = false;
      this.airborne = false;
      this.floorHit = false;
      this.bounces = 0;
      this.shot = true;
      this.shotResolved = false;
      this.hideAt = null;
      this.announce(recordThrow());
      addShot();
      if (this.onlineMatch?.game !== "speed") {
        this.clearRemoteBallVisuals();
        this.sharedBallTarget = null;
      }
      this.onlineMatch?.localShot();
      this.crowd.shotStart(performance.now());
      play("shoot", clamp(d.power, 0.3, 1));
    } else if (this.hoop && !this.onlineMatch) {
      this.hoop.phase = "out";
    }
    this.start();
  }

  private fullPull(d: Drag, dx: number, dy: number): number {
    const l = Math.hypot(dx, dy);
    if (l < 0.001) return MAXPULL;
    const { w, h } = this.cssSize();
    const sx = d.gx / this.S;
    const sy = d.gy / this.S;
    const ux = dx / l;
    const uy = dy / l;
    const tx = ux > 0 ? (w / this.S - sx) / ux : ux < 0 ? (0 - sx) / ux : Infinity;
    const ty = uy > 0 ? (h / this.S - sy) / uy : uy < 0 ? (0 - sy) / uy : Infinity;
    return clamp(Math.min(tx, ty) * 0.9, 10, MAXPULL);
  }

  private releaseMoved(e: PointerEvent): void {
    const b = this.ball;
    const k = this.S * this.me.scale;
    const gx = this.me.x + e.clientX * k / this.S;
    const gy = this.me.y + e.clientY * k / this.S;
    const inside =
      e.clientX >= 0 && e.clientY >= 0 && e.clientX <= this.artW * this.S && e.clientY <= this.artH * this.S;
    if (!inside) {
      const target = this.monitors.find(
        (o) => o.index !== this.me.index && gx >= o.x && gx < o.x + o.w && gy >= o.y && gy < o.y + o.h,
      );
      if (target) {
        this.capThrow();
        b.gs = 1;
        b.t = 999;
        b.postGoal = false;
        this.shot = false;
        this.handoffTo(target, gx, gy);
        return;
      }
    }
    this.capThrow();
    b.gs = 1;
    b.t = 999;
    b.scored = false;
    b.postGoal = false;
    b.kicked = false;
    b.entering = false;
    b.moving = true;
    this.shot = false;
    this.hideAt = null;
    this.start();
  }

  private capThrow(): void {
    const b = this.ball;
    b.vx *= THROW_GAIN;
    b.vy *= THROW_GAIN;
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > THROW_CAP) {
      b.vx *= THROW_CAP / sp;
      b.vy *= THROW_CAP / sp;
    }
  }

  private poleBottom(): number {
    return settings.court ? this.floorY + BASE_CENTER[settings.baseSkin] - 2 : this.artH;
  }

  private showHoop(forceSide?: "left" | "right", forceH?: number): void {
    if (this.hoop && this.hoop.phase !== "out") return;
    const b = this.ball;
    const gap = BALL_R + 36;
    const okRight = b.x < this.artW - this.refR.w - gap;
    const okLeft = b.x > this.refL.w + gap;
    const onlineTurnGame = this.onlineMatch && this.onlineMatch.game !== "speed";
    const round = this.onlineHoopRound++;
    let side: "left" | "right";
    if (forceSide) side = forceSide;
    else if (onlineTurnGame) side = this.onlineHash(`${this.onlineMatch!.seed}:${round}:side`) % 2 ? "right" : "left";
    else if (okRight && okLeft) side = Math.random() < 0.5 ? "left" : "right";
    else if (okRight) side = "right";
    else if (okLeft) side = "left";
    else side = b.x < this.artW / 2 ? "right" : "left";
    const sp = side === "right" ? this.spR : this.spL;
    const maxH = Math.min(260, this.artH * 0.6);
    const sharedHeight = onlineTurnGame ? 70 + (this.onlineHash(`${this.onlineMatch!.seed}:${round}:height`) / 0x7fffffff) * Math.max(10, maxH - 70) : null;
    let rimY = forceH !== undefined ? this.floorY - forceH : this.floorY - (sharedHeight ?? rnd(70, Math.max(80, maxH)));
    rimY = Math.max(rimY, 8 + sp.rimY);
    const ref = side === "right" ? this.refR : this.refL;
    const hx0 = side === "right" ? this.artW - ref.w + ref.rimCx - sp.rimCx : ref.rimCx - sp.rimCx;
    this.hoop = {
      sprite: sp,
      side,
      x0: hx0,
      y0: rimY - sp.rimY,
      rimY,
      phase: "in",
      p: 0,
      off: (side === "right" ? 1 : -1) * (sp.w + 8),
      vel: 0,
      pole: makePoleSprite(side, this.poleBottom() - (rimY - sp.rimY - sp.shiftY) + 2, settings.baseSkin),
      poleX: hx0 - sp.shiftX,
      poleY: rimY - sp.rimY - sp.shiftY,
      poleBox: [
        sp.poleTop[0],
        sp.poleTop[1],
        [sp.poleTop[1][0], this.poleBottom() - (rimY - sp.rimY) + 2],
        [sp.poleTop[0][0], this.poleBottom() - (rimY - sp.rimY) + 2],
      ],
      net: new Net(sp.netGeom, hx0, rimY - sp.rimY),
    };
    this.hideAt = null;
    play("appear");
  }

  private onlineHash(value: string): number {
    let h = 0;
    for (let i = 0; i < value.length; i++) h = (Math.imul(31, h) + value.charCodeAt(i)) | 0;
    return Math.abs(h);
  }

  start(): void {
    if (this.running || !this.active) return;
    this.running = true;
    this.last = performance.now();
    this.acc = 0;
    requestAnimationFrame((t) => this.tick(t));
  }

  private needsLoop(now: number): boolean {
    return (
      this.trailHist.length > 0 ||
      this.ghost !== null ||
      this.sharedBallTarget !== null ||
      this.nudgeX !== null ||
      this.ball.moving ||
      !!this.drag ||
      !!this.hoop ||
      this.confetti.active ||
      this.milestone.active ||
      this.fire.active() ||
      this.crowd.skyBusy() ||
      Math.abs(this.ballAlpha - this.ballTargetAlpha()) > 0.01 ||
      (!!this.bubble && now - this.bubble.t0 < settings.bubble * 1000)
    );
  }

  /** HORSE and 21 online, and it is the other player's turn (or their shot is still rolling): the shared ball is passive. */
  private sharedBallAway(): boolean {
    const m = this.onlineMatch;
    // (your own ball stays while it is still rolling after your shot)
    return !!m && m.game !== "speed" && !m.over && (m.turn === "opp" || m.waitingForPeer) && !this.ball.moving && !this.shot && !this.drag;
  }

  /** The other player's ball has stopped across the screen at nx: it is yours now, from there. */
  takeBallAt(nx: number): void {
    const b = this.ball;
    b.x = this.xFromPeer(nx);
    b.y = this.floorY - BALL_R;
    b.vx = 0;
    b.vy = 0;
    b.moving = false;
    this.clearRemoteBallVisuals();
    this.sharedBallTarget = null;
    this.sharedSamples.length = 0;
    this.shot = false;
    this.nudgeX = null;
    // their ball has stopped: now the hoop can move
    this.hoopSwapAt = performance.now() + 300;
    this.start();
    this.syncHit();
  }

  private ballTargetAlpha(): number {
    const m = this.onlineMatch;
    if (m && m.game !== "speed" && !m.over) {
      // The shared ball is solid for the active player and see-through for the spectator.
      // Keep it see-through until the opponent's stopped-ball handoff has arrived.
      return m.turn === "me" && !m.waitingForPeer ? 1 : 0.25;
    }
    if (this.ball.moving || this.drag) return 1;
    return 1 - settings.ballFade;
  }

  private tick(now: number): void {
    if (!this.active) {
      this.running = false;
      return;
    }
    this.acc += Math.min(50, now - this.last);
    this.last = now;
    while (this.acc >= STEP_MS) {
      this.acc -= STEP_MS;
      this.update(STEP_MS, now);
      if (!this.active) {
        this.running = false;
        return;
      }
    }
    this.render(now);
    if (this.needsLoop(now)) {
      requestAnimationFrame((t) => this.tick(t));
    } else {
      this.running = false;
      this.syncHit();
    }
  }

  private update(ms: number, now: number): void {
    const b = this.ball;
    const dr = this.drag;
    if (this.onlineMatch?.game !== "speed" && this.ghost) this.clearRemoteBallVisuals();
    if (dr && dr.move) {
      b.vx = (b.vx + (dr.tx - b.x) * HOLD_K) * HOLD_DAMP;
      b.vy = (b.vy + (dr.ty - b.y) * HOLD_K) * HOLD_DAMP;
      b.x = clamp(b.x + b.vx, BALL_R, this.artW - BALL_R);
      b.y = clamp(b.y + b.vy, BALL_R, this.floorY - BALL_R);
      b.ang += b.vx / BALL_R;
    }
    if (this.hoopSwapAt && now >= this.hoopSwapAt && !this.ball.moving) {
      // after a goal or a miss the hoop moves to a new place (the court stays), but only once the ball has stopped; not while a shot is being pulled
      this.hoopSwapAt = 0;
    this.onlineHoopRound = 0;
      if ((this.onlineMatch || settings.stayOpen) && this.hoop && !this.drag) {
        // the court stays while the new hoop slides in
        this.keepCourt = true;
        this.hoop = null;
        this.showHoop();
      }
    }
    if (this.ghost && (performance.now() > this.ghostUntil || !this.onlineMatch || this.onlineMatch.over)) {
      this.ghost = null;
      this.ghostBuf.length = 0;
    }
    if (this.nudgeX !== null) {
      // A finger needs room to pull the ball back: ease a ball that stopped by an edge a little inwards.
      if (dr || b.moving) {
        this.nudgeX = null;
      } else {
        const dx = this.nudgeX - b.x;
        const step = Math.abs(dx) < 0.4 ? dx : dx * 0.12;
        b.x += step;
        b.ang += step / BALL_R;
        if (Math.abs(this.nudgeX - b.x) < 0.01) {
          this.nudgeX = null;
          this.syncHit();
        }
      }
    }
    const sharedTarget = this.sharedBallTarget;
    if (sharedTarget) {
      if (now > sharedTarget.until || !this.sharedBallAway()) {
        this.sharedBallTarget = null;
        this.sharedSamples.length = 0;
      } else {
        const samples = this.sharedSamples;
        const at = now - 80;
        while (samples.length > 2 && samples[1].t <= at) samples.shift();
        const a = samples[0] ?? sharedTarget;
        const c = samples[1] ?? a;
        const k = "t" in a && "t" in c ? clamp((at - a.t) / Math.max(1, c.t - a.t), 0, 1) : 1;
        b.x = a.x + (c.x - a.x) * k;
        b.y = a.y + (c.y - a.y) * k;
        b.ang = a.ang + (c.ang - a.ang) * k;
      }
    }
    if (this.onlineMatch && !this.onlineMatch.over) {
      const nowMs = performance.now();
      if (this.onlineMatch.game === "speed") {
        // both play at once: the other player sees your ball as a ghost, about 20 times a second while it moves, and now and then when it rests
        if (nowMs - this.ballSentAt >= (b.moving ? 33 : 250)) {
          this.ballSentAt = nowMs;
          this.sendFreeBall();
        }
      } else if (!b.moving && !this.shot && this.onlineMatch.turn === "me" && nowMs - this.ballSentAt >= 120) {
        // HORSE and 21, your turn, ball resting: the other player sees it where it is (it is the one ball)
        this.ballSentAt = nowMs;
        this.sendFreeBall();
      } else if (b.moving && this.shot && nowMs - this.ballSentAt >= 16) {
        // HORSE and 21: send the actual shared ball position, not a separate simulated arc.
        this.ballSentAt = nowMs;
        this.sendFreeBall();
      }
    }
    if (b.moving) {
      for (let i = 0; i < SUB && this.active; i++) this.sub(0.25 * TIME_SCALE);
      if (!this.active) return;
      const fy = this.floorY - BALL_R;
      if (b.y >= fy - 0.01 && b.vy === 0) {
        const f = (ms / STEP_MS) * TIME_SCALE;
        b.vx *= Math.pow(0.94, f);
        const dec = 0.03 * f;
        b.vx = Math.abs(b.vx) <= dec ? 0 : b.vx - Math.sign(b.vx) * dec;
        if (Math.abs(b.vx) < 0.2) this.rest(now);
        else if (!this.slowSlide && Math.abs(b.vx) < SLIDE_GRAB) {
          this.slowSlide = true;
          this.syncHit();
        }
      }
    }
    const h = this.hoop;
    if (h) {
      if (h.phase === "in") {
        h.p = Math.min(1, h.p + ms / 400);
        if (h.p >= 1) {
          h.phase = "shown";
          this.keepCourt = false;
          this.syncHit();
        }
      } else if (h.phase === "out") {
        h.p = Math.max(0, h.p - ms / 250);
        if (h.p <= 0) {
          this.hoop = null;
          this.keepCourt = false;
          this.syncHit();
        }
      }
      // in an online match the court stays up all the time
      if (!settings.stayOpen && !this.onlineMatch && this.hideAt !== null && now >= this.hideAt && now >= this.crowd.holdUntil(settings.crowd, now) && h.phase === "shown") {
        const toward = h.side === "right" ? b.vx > 1.2 : b.vx < -1.2;
        const inAir = b.y < this.floorY - BALL_R - 5;
        if (b.moving && (inAir || toward)) {
          this.hideAt = now + 300;
        } else {
          h.phase = "out";
          this.hideAt = null;
        }
      }
      const dir = h.side === "right" ? 1 : -1;
      const off = (1 - (1 - Math.pow(1 - h.p, 3))) * (h.sprite.w + 8) * dir;
      const f = ms / STEP_MS;
      const vel = (off - h.off) / f;
      const acc = vel - h.vel;
      h.vel = vel;
      h.off = off;
      h.net.setHoop(ms, off, acc);
      if (!b.moving) for (let i = 0; i < SUB; i++) h.net.step(0.25 * TIME_SCALE, null);
    }
    this.confetti.update(ms);
    this.milestone.update(ms);
    this.syncEsc();
    if (this.gaspAt && now >= this.gaspAt) {
      this.gaspAt = 0;
      if (!this.ball.scored && !this.ball.postGoal && !this.gasped) {
        this.gasped = true;
        this.lastGasp = performance.now();
        play("gasp", 0.9);
      }
    }
  }

  private nudgeX: number | null = null;

  private rest(now: number): void {
    const b = this.ball;
    if (TOUCH_WEB && (!this.onlineMatch || this.onlineMatch.game === "speed")) {
      const lo = EDGE_ROOM;
      const hi = this.artW - EDGE_ROOM;
      if (b.x < lo || b.x > hi) this.nudgeX = clamp(b.x, lo, hi);
    }
    this.slowSlide = false;
    b.vx = 0;
    b.vy = 0;
    b.y = this.floorY - BALL_R;
    b.moving = false;
    b.entering = false;
    if (this.shot) {
      if (!b.scored) this.markMiss();
      this.shot = false;
      // HORSE and 21: one ball, so the other player carries on from where it stopped
      if (this.onlineMatch && this.onlineMatch.game !== "speed") this.onlineMatch.sendRest(this.ballNx());
      const soon = now + 600;
      this.hideAt = this.hideAt === null ? now + 700 : Math.min(this.hideAt, soon);
    }
    this.syncHit();
    if (!this.introDone) {
      this.introDone = true;
      if (!isOnboarded()) this.ui.openOnboarding();
    }
  }

  private neighbor(dir: -1 | 1): MonitorInfo | null {
    const m = this.me;
    const gy = m.y + this.ball.y * this.S * m.scale;
    const gx = dir < 0 ? m.x - 2 : m.x + m.w + 2;
    return (
      this.monitors.find((o) => o.index !== m.index && gx >= o.x && gx < o.x + o.w && gy >= o.y && gy < o.y + o.h) ??
      null
    );
  }

  private handoff(target: MonitorInfo): void {
    const k = this.S * this.me.scale;
    this.handoffTo(target, this.me.x + this.ball.x * k, this.me.y + this.ball.y * k);
  }

  private handoffTo(target: MonitorInfo, gx: number, gy: number): void {
    const b = this.ball;
    const k = this.S * this.me.scale;
    const payload: Handoff = {
      gx,
      gy,
      shot: this.shot,
      vx: b.vx * k,
      vy: b.vy * k,
      gs: b.gs,
      t: b.t,
      postGoal: b.postGoal,
    };
    this.deactivate();
    void sendHandoff(target.label, payload).then(() => activateOverlay(target.label));
  }

  private collideCircle(cx: number, cy: number, r: number, e: number, sfx: "rim" | "board"): void {
    const b = this.ball;
    const dx = b.x - cx;
    const dy = b.y - cy;
    const d = Math.hypot(dx, dy);
    const min = BALL_R + r;
    if (d >= min || d === 0) return;
    const nx = dx / d;
    const ny = dy / d;
    b.x = cx + nx * min;
    b.y = cy + ny * min;
    const vn = b.vx * nx + b.vy * ny;
    const pvx = b.vx;
    if (vn < 0) {
      b.vx -= (1 + e) * vn * nx;
      b.vy -= (1 + e) * vn * ny;
      if (-vn > 0.8) this.collisionSound(sfx, clamp(-vn / 8, 0.25, 1));
      if (sfx === "rim" && -vn > 0.8) this.rimTouched = true;
      if (sfx === "rim" && -vn > 0.8 && this.hoop) this.hoop.net.rimHit(pvx >= 0 ? 1 : -1, clamp(-vn / 4, 0.35, 1.9));
      // Only a hit on the top of the rim (the ball coming down onto it) can make the crowd gasp, and only some of the time (and not twice in a row), or it wears thin.
      if (sfx === "rim" && ny < -0.35 && -vn > 1.2 && !this.gasped && !this.gaspAt && performance.now() - this.lastGasp > 20000 && Math.random() < 0.4) {
        this.gaspAt = performance.now() + 700;
      }
    }
  }

  private collidePoly(hull: [number, number][], ox: number, oy: number, e: number, shakesNet = false): void {
    const b = this.ball;
    const n = hull.length;
    let inside = false;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const ax = hull[i][0] + ox;
      const ay = hull[i][1] + oy;
      const bx = hull[j][0] + ox;
      const by = hull[j][1] + oy;
      if (ay > b.y !== by > b.y && b.x < ((bx - ax) * (b.y - ay)) / (by - ay) + ax) inside = !inside;
    }
    let best = Infinity;
    let nx = 0;
    let ny = 0;
    let cxp = 0;
    let cyp = 0;
    for (let i = 0; i < n; i++) {
      const ax = hull[i][0] + ox;
      const ay = hull[i][1] + oy;
      const bx = hull[(i + 1) % n][0] + ox;
      const by = hull[(i + 1) % n][1] + oy;
      const ex = bx - ax;
      const ey = by - ay;
      const len2 = ex * ex + ey * ey || 1;
      const t = clamp(((b.x - ax) * ex + (b.y - ay) * ey) / len2, 0, 1);
      const px = ax + ex * t;
      const py = ay + ey * t;
      const d = Math.hypot(b.x - px, b.y - py);
      if (d < best) {
        best = d;
        cxp = px;
        cyp = py;
      }
    }
    if (!inside && best >= BALL_R) return;
    let dx = b.x - cxp;
    let dy = b.y - cyp;
    let d = Math.hypot(dx, dy);
    if (d < 1e-6) {
      dx = 0;
      dy = -1;
      d = 1;
    }
    nx = dx / d;
    ny = dy / d;
    if (inside) {
      nx = -nx;
      ny = -ny;
      b.x = cxp + nx * BALL_R;
      b.y = cyp + ny * BALL_R;
    } else {
      b.x = cxp + nx * BALL_R;
      b.y = cyp + ny * BALL_R;
    }
    const vn = b.vx * nx + b.vy * ny;
    const pvx = b.vx;
    if (vn < 0) {
      b.vx -= (1 + e) * vn * nx;
      b.vy -= (1 + e) * vn * ny;
      if (-vn > 0.8) {
        this.collisionSound("board", clamp(-vn / 8, 0.25, 1));
        if (this.hoop && hull === this.hoop.sprite.hull) this.boardTouched = true;
        if (shakesNet && this.hoop) this.hoop.net.rimHit(pvx >= 0 ? 1 : -1, clamp(-vn / 4, 0.35, 1.9));
      }
    }
  }

  private sub(dt: number): void {
    const b = this.ball;
    b.t += dt;
    const hp = this.hoop;
    let inNet = false;
    if (hp) {
      const l0 = hp.x0 + Math.min(hp.sprite.frontX, hp.sprite.backX);
      const r0 = hp.x0 + Math.max(hp.sprite.frontX, hp.sprite.backX);
      inNet = b.x > l0 && b.x < r0 && b.y > hp.rimY && b.y < hp.rimY + hp.sprite.netLen + BALL_R;
    }
    b.vy += geff(b.gs, b.t) * (inNet ? 1.12 : 1) * dt;
    const py = b.y;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.ang += (b.vx * dt) / BALL_R;

    const h = this.hoop;
    if (h && h.phase !== "out") {
      const sp = h.sprite;
      const fx = h.x0 + sp.frontX;
      const bx = h.x0 + sp.backX;
      this.collidePoly(sp.hull, h.x0, h.y0, 0.55, true);
      this.collidePoly(h.poleBox, h.x0, h.y0, 0.5, true);
      this.collideCircle(fx, h.rimY, 1.8, 0.5, "rim");
      this.collideCircle(bx, h.rimY, 1.8, 0.5, "rim");
      const l = Math.min(fx, bx);
      const r = Math.max(fx, bx);
      if (py > h.rimY && b.y <= h.rimY && b.vy < 0 && b.x > l && b.x < r) b.noScore = true;
      if (!b.scored && !b.noScore && py < h.rimY && b.y >= h.rimY && b.vy > 0 && b.x > l + 1 && b.x < r - 1) {
        this.goal(h);
      } else if (!b.scored && b.vy > 0 && b.y > h.rimY + 30) {
        // Fell past the net without going in: that was a miss, and the fire goes out right away.
        this.markMiss();
      }
    }
    if (h) {
      const f = h.net.step(dt, { x: b.x, y: b.y, vx: b.vx, vy: b.vy, r: BALL_R });
      let ax = f[0] / NET_PARAMS.ballMass;
      let ay = f[1] / NET_PARAMS.ballMass;
      const am = Math.hypot(ax, ay);
      if (am > NET_PARAMS.maxBallAccel) {
        ax *= NET_PARAMS.maxBallAccel / am;
        ay *= NET_PARAMS.maxBallAccel / am;
      }
      b.vx += ax * dt;
      b.vy += ay * dt;
    }

    const fy = this.floorY - BALL_R;
    if (b.y < fy - 3) this.airborne = true;
    if (b.y > fy) {
      if (this.shot && this.airborne && !this.floorHit) {
        this.floorHit = true;
        this.syncHit();
        const t = performance.now() + 600;
        this.hideAt = this.hideAt === null ? t : Math.min(this.hideAt, t);
      }
      b.y = fy;
      b.noScore = false;
      if (b.vy > 1.2) {
        if (!b.scored) this.markMiss();
        this.collisionSound("bounce", clamp(b.vy / 9, 0.2, 1));
        if (this.burning) this.fire.bounce(b.x, b.y);
        // First bounces as before, then they die out faster so hard shots do not make you wait.
        const e = this.bounces < 2 ? 0.74 : Math.max(0.35, 0.62 - (this.bounces - 2) * 0.1);
        this.bounces++;
        b.vy *= -e;
        b.vx *= this.bounces > 2 ? 0.85 : 0.93;
      } else {
        b.vy = 0;
      }
      if (b.postGoal && !b.kicked) {
        b.kicked = true;
        // Where it rolls to after a goal is a matter of luck: usually a short roll, sometimes a long one, and now and then away from the middle.
        const dir = (this.artW / 2 - b.x >= 0 ? 1 : -1) * (Math.random() < 0.2 ? -1 : 1);
        const r = Math.random();
        b.vx = dir * (r < 0.4 ? rnd(0.4, 1.6) : r < 0.8 ? rnd(1.6, 3.6) : rnd(3.6, 6.5));
      }
    }

    if (b.entering) {
      if (b.x >= BALL_R && b.x <= this.artW - BALL_R) b.entering = false;
    } else if (b.x < BALL_R) {
      const n = this.neighbor(-1);
      if (n) {
        if (b.x < 0) {
          this.handoff(n);
          return;
        }
      } else {
        b.x = BALL_R;
        if (b.vx < 0) {
          if (-b.vx > 1) this.collisionSound("wall", clamp(-b.vx / 8, 0.2, 1));
          b.vx *= -0.65;
        }
      }
    } else if (b.x > this.artW - BALL_R) {
      const n = this.neighbor(1);
      if (n) {
        if (b.x > this.artW) {
          this.handoff(n);
          return;
        }
      } else {
        b.x = this.artW - BALL_R;
        if (b.vx > 0) {
          if (b.vx > 1) this.collisionSound("wall", clamp(b.vx / 8, 0.2, 1));
          b.vx *= -0.65;
        }
      }
    }
    if (b.y < -700) {
      b.y = -700;
      b.vy = Math.abs(b.vy);
    }
  }

  /** The layers that play together on a milestone. */
  private milestoneSounds(): void {
    window.setTimeout(() => {
      play("milestone");
      play("levelup");
    }, 450);
  }

  private demoN = 0;

  /** Plays a milestone the way it looks and sounds in a game, without touching the score. */
  /** Lights the ball the way a third goal in a row does, or puts it out again. */
  previewFire(): void {
    if (!this.active) return;
    this.ui.close();
    if (this.burning) {
      this.burning = false;
      this.fireOn = false;
      this.putOutFire(this.ball.x, this.ball.y);
    } else {
      this.burning = true;
      this.fireOn = true;
      this.fire.mode = settings.fireStyle;
      this.fire.ignite();
      play("ignite");
    }
    this.start();
  }

  previewAchievement(): void {
    this.ui.showAchievement("Nothing but net");
    play("achievement");
    play("achievement2", 0.9);
  }

  previewMilestone(): void {
    if (!this.active) return;
    const values = [25, 50, 100, 200];
    const n = values[this.demoN++ % values.length];
    this.ui.close();
    play("swish");
    play("swoosh2", 0.8);
    play("cheer", 0.9);
    play("boom", 0.9);
    play("crowd", 0.8);
    this.milestoneSounds();
    this.milestone.start(n);
    this.confetti.spawn(settings.confetti);
    if (settings.confetti > 0) play("confetti", 0.8);
    this.start();
  }

  private achQueue: Achievement[] = [];
  private achBusy = false;

  /** Shows newly unlocked achievements one after another. */
  private announce(list: Achievement[]): void {
    if (list.length) {
      // a new trail when the count of achievements passes a step (after the achievement cards)
      const after = achievementsDone();
      const fresh = trailsUnlockedBetween(after - list.length, after);
      if (fresh.length) {
        const t = fresh[fresh.length - 1];
        window.setTimeout(() => this.ui.showTrailUnlock(t), (this.achQueue.length + list.length) * 3600 + 400);
      }
    }
    this.achQueue.push(...list);
    if (this.achBusy) return;
    const next = (): void => {
      const a = this.achQueue.shift();
      if (!a) {
        this.achBusy = false;
        return;
      }
      this.achBusy = true;
      this.ui.showAchievement(a.name);
      play("achievement");
      play("achievement2", 0.9);
      window.setTimeout(next, 3600);
    };
    next();
  }

  /** The fire on the ball goes out. A miss adds the hiss; hiding the scene stays quiet. */
  private putOutFire(x: number, y: number, sound = false): void {
    this.fire.extinguish(x, y);
    if (sound) play("extinguish");
  }

  private collisionSound(name: "bounce" | "wall" | "board" | "rim", intensity: number): void {
    play(name, intensity);
    if (this.shot) this.onlineMatch?.sendSound(name, intensity);
  }

  /** The shot missed: the streak ends and the fire is put out at once. */
  private markMiss(): void {
    if (!this.shot || this.shotResolved) return;
    this.shotResolved = true;
    const b = this.ball;
    recordMiss();
    pushLast10(false);
    if (this.burning) {
      this.burning = false;
      this.fireOn = false;
      this.putOutFire(b.x, b.y, true);
      if (this.onlineMatch && this.onlineMatch.game !== "speed") this.fire = new BallFire();
    }
    if (this.onlineMatch) {
      this.onlineMatch.localResult(false);
      this.hoopSwapAt = performance.now() + 900;
    } else if (settings.stayOpen) {
      this.hoopSwapAt = performance.now() + 900;
    }
  }

  private goal(h: Hoop): void {
    const b = this.ball;
    b.scored = true;
    this.shotResolved = true;
    b.postGoal = true;
    // The net takes the speed out of a long shot, so the ball does not fly on to the far wall and back.
    b.vx *= rnd(0.15, 0.5);
    this.gaspAt = 0;
    pushLast10(true);
    this.crowd.goal(performance.now());
    this.announce(
      recordGoal({
        clean: !this.rimTouched && !this.boardTouched,
        bank: this.boardTouched,
        rim: this.rimTouched,
        far: this.shotFar,
      }),
    );
    // The ball catches fire on the third goal in a row.
    if (!this.onlineMatch && getStats().streak === 3) {
      this.burning = true;
      this.fireOn = true;
      this.fire.mode = settings.fireStyle;
      this.fire.ignite();
      play("ignite");
    }
    h.net.impulse(rnd(-0.25, 0.25), 0.3);
    this.hideAt = performance.now() + 1500;
    // an online match does not count for the leaderboard score
    if (this.onlineMatch) {
      this.onlineMatch.localResult(true, this.shotFar);
      this.hoopSwapAt = performance.now() + 900;
    }
    else {
      setScore(getScore() + 1);
      queueLeaderboardScoreSync();
      // "Keep the court open": the hoop still moves to a new place after a goal
      if (settings.stayOpen) this.hoopSwapAt = performance.now() + 900;
    }
    const s = this.onlineMatch ? -1 : getScore();
    play("swish");
    play("swoosh2", 0.8);
    play("cheer", 0.9);
    play("boom", 0.9);
    play("crowd", 0.8);
    if (isMilestone(s)) {
      this.milestoneSounds();
      this.milestone.start(s);
      this.bubble = null;
    } else {
      this.bubble = {
        t0: performance.now(),
        cx: h.x0 + h.sprite.rimCx,
        top: Math.max(4, h.y0 - 26),
      };
    }
    this.confetti.spawn(settings.confetti);
    this.crowd.cheer(performance.now());
    if (settings.confetti > 0) play("confetti", 0.8);
    this.start();
  }

  private render(now: number): void {
    const ctx = this.ctx;
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, this.artW, this.artH);
    // A short camera shake when the ball explodes.
    const [shx, shy] = this.fire.shake();
    ctx.save();
    ctx.translate(shx, shy);
    const b = this.ball;

    const ch = this.hoop;
    if (ch && settings.court) {
      const cs: CourtSprite = ch.side === "right" ? this.courtR : this.courtL;
      // in an online match, and while a new hoop slides in, the court is fully up
      const rise = Math.pow(1 - (this.onlineMatch || this.keepCourt ? 1 : ch.p), 3) * (this.artH - (this.floorY - cs.cy));
      const courtTop = Math.round(this.floorY - cs.cy + rise);
      this.crowd.setBall(this.ball.x, this.floorY + rise, this.ball.y);
      this.crowd.setHoop(ch.x0 + ch.sprite.rimCx, ch.rimY, ch.side);
      // Off, only the front row, half the screen, or all of it
      const row = settings.crowdRow && !settings.arenaFill && settings.crowd !== "none";
      const half = !settings.crowdRow && !settings.arenaFill && settings.crowd !== "none";
      const clipTop = row ? courtTop + 1 - CROWD_ROW_H : half ? Math.min(courtTop + 1, Math.round(this.artH / 2)) : 0;
      if (row || half) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, clipTop, this.artW, courtTop + 1 - clipTop);
        ctx.clip();
      }
      this.crowd.draw(ctx, settings.crowd, now, this.artW, courtTop + 1, this.crowdFill());
      if (row || half) ctx.restore();
      ctx.drawImage(cs.canvas, ch.side === "right" ? this.artW - cs.w : 0, courtTop);
      if (settings.crowd === "arena") this.crowd.arenaFloor(ctx, now, this.artW, courtTop, cs.h);
    }

    const height = clamp((this.floorY - BALL_R - b.y) / 70, 0, 1);
    // With the arena lights the key light is fixed above the middle of the screen, so the shadow falls away from it.
    const lit = !!this.hoop && settings.court && settings.crowd === "arena";
    const tl = (b.x - this.artW / 2) / this.crowd.keyH(this.floorY, this.crowdFill());
    const rx = BALL_R * 0.9 * (1 - height * 0.6) + (lit ? BALL_R * Math.abs(tl) * 1.3 : 0);
    const sOff = lit ? Math.round(BALL_R * tl * 0.8 * (1 - height * 0.5)) + Math.sign(tl) * 3 : 0;
    const sy = lit ? 3 : 2.4;
    // In the arena the key light's shadow is drawn by the crowd, inside the floor pool along the beam.
    for (let y = -3; y <= 3 && !lit && !this.sharedBallAway(); y++) {
      for (let x = -Math.round(rx); x <= Math.round(rx); x++) {
        const q = (x / rx) ** 2 + (y / sy) ** 2;
        if (q > 1) continue;
        if (q < 0.55 || (x + y) % 2 === 0 || lit) {
          ctx.fillStyle = lit ? `rgba(6,4,18,${q < 0.45 ? 0.62 : 0.38})` : `rgba(8,4,24,${q < 0.55 ? 0.3 : 0.18})`;
          ctx.fillRect(Math.round(b.x) + x + sOff, this.floorY - 1 + y, 1, 1);
        }
      }
    }

    const h = this.hoop;
    let hoopOff = 0;
    if (h) {
      hoopOff = Math.round(h.off);
      ctx.drawImage(h.pole, h.poleX + hoopOff, h.poleY);
      ctx.drawImage(h.sprite.canvas, h.x0 + hoopOff, h.y0);
      h.net.draw(ctx, "back");
    }

    this.confetti.draw(ctx);

    if (this.ball.moving && this.crowd.shootAtHero(settings.crowd, b.x, b.y, BALL_R)) {
      this.announce(recordHeroDown());
      play("boom", 0.9);
    }
    const swat = this.ball.moving ? this.crowd.guardianSwat(settings.crowd, b.x, b.y, BALL_R) : null;
    if (swat !== null) {
      // Night Owl bats it away: back where it came from, and it does not count
      b.vx = swat * Math.max(2.5, Math.abs(b.vx) * 0.9);
      b.vy = -Math.abs(b.vy) * 0.4 - 1.5;
      b.noScore = true;
      play("board", 0.9);
    }
    const fdt = Math.min(0.033, (now - (this.fireAt || now)) / 1000);
    this.fireAt = now;
    // The fire goes out quietly with the scene and catches again when you grab the ball and the scene returns.
    const sceneUp = !!this.hoop && this.hoop.phase !== "out";
    if (this.burning && sceneUp !== this.sceneWasUp) {
      if (sceneUp) {
        this.fireOn = true;
        this.fire.relight();
      } else if (this.fireOn) {
        this.fireOn = false;
        this.putOutFire(b.x, b.y);
      }
    }
    this.sceneWasUp = sceneUp;
    this.fire.update(fdt, { x: b.x, y: b.y, vx: b.vx * 60, vy: b.vy * 60 }, this.floorY, this.burning && this.fireOn);
    this.fire.drawBack(ctx);

    // the trail: where the ball has been while it flies (it fades away when the ball rests)
    const tr = trailById(settings.trail);
    if (b.moving && tr.id !== "none" && trailOwned(tr)) {
      this.trailHist.push({ x: b.x, y: b.y });
      if (this.trailHist.length > 30) this.trailHist.shift();
    } else if (this.trailHist.length) {
      this.trailHist.splice(0, 3);
    }
    if (this.trailHist.length > 1 && !this.sharedBallAway()) drawTrail(ctx, tr.id, this.trailHist, now, 1);

    const turns = ((b.ang % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const bs = BALL_SPRITE_SIZE * this.fire.scale();
    const target = this.ballTargetAlpha();
    this.ballAlpha += (target - this.ballAlpha) * (target < this.ballAlpha ? 0.12 : 0.4);
    if (Math.abs(this.ballAlpha - target) < 0.01) this.ballAlpha = target;
    if (this.fire.visible()) {
      ctx.globalAlpha = this.ballAlpha;
      ctx.drawImage(
        this.framesFor(!!this.hoop && settings.court && settings.crowd === "arena", b.x)[Math.round((turns / (2 * Math.PI)) * BALL_FRAMES) % BALL_FRAMES],
        Math.round(b.x - bs / 2),
        Math.round(b.y - bs / 2),
        Math.round(bs),
        Math.round(bs),
      );
      ctx.globalAlpha = 1;
    }

    const gn = this.onlineMatch?.game === "speed" && this.ghost ? this.ghostNow(now) : null;
    if (gn) {
      const g = gn;
      this.ghostFrames ??= makeBallFrames((BALL_SKINS.find((k) => k.id === "blue") ?? BALL_SKINS[0]).pal, (BALL_SKINS.find((k) => k.id === "blue") ?? BALL_SKINS[0]).seam);
      const frames = this.onlineMatch?.game === "speed" ? this.ghostFrames : this.ballFrames;
      const gt = ((g.ang % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      ctx.globalAlpha = this.onlineMatch?.game === "speed" ? 0.6 : 1;
      ctx.drawImage(
        frames[Math.round((gt / (2 * Math.PI)) * BALL_FRAMES) % BALL_FRAMES],
        Math.round(g.x - BALL_SPRITE_SIZE / 2),
        Math.round(g.y - BALL_SPRITE_SIZE / 2),
        BALL_SPRITE_SIZE,
        BALL_SPRITE_SIZE,
      );
      ctx.globalAlpha = 1;
    }

    this.fire.drawFront(ctx);
    this.fire.overlay(ctx, this.artW, this.artH);

    if (h) {
      h.net.draw(ctx, "front");
      ctx.drawImage(h.sprite.front, h.x0 + hoopOff, h.y0);
    }

    const d = this.drag;
    if (d && d.power > 0.04) {
      const l = Math.hypot(d.lx, d.ly) || 1;
      drawAim(ctx, settings.arrow, b.x, b.y, -d.lx / l, -d.ly / l, d.power, Math.abs(d.ly / l), this.vmax);
    }

    if (this.bubble) {
      const dur = settings.bubble * 1000;
      const e = now - this.bubble.t0;
      if (e >= dur) {
        this.bubble = null;
      } else {
        this.drawBubble(e, dur);
      }
    }
    this.milestone.draw(ctx);
    ctx.restore();
  }

  private drawBubble(e: number, dur: number): void {
    const ctx = this.ctx;
    const bb = this.bubble!;
    const str = String(this.onlineMatch ? this.onlineMatch.scoreMe : getScore());
    ctx.globalAlpha = clamp(e > dur - 500 ? (dur - e) / 500 : 1, 0, 1);
    const w = textWidth(str, 2) + 10 + (e < 150 ? 4 : 0);
    const hh = 22 + (e < 150 ? 2 : 0);
    const bx = Math.round(bb.cx - w / 2);
    const by = bb.top + (e < 250 ? Math.round(((250 - e) / 250) * 7) : 0) + (e < 150 ? -1 : 0);
    layer(ctx, (put) => {
      for (let y = 0; y < hh; y++) {
        for (let x = 0; x < w; x++) {
          if ((x === 0 || x === w - 1) && (y === 0 || y === hh - 1)) continue;
          put(bx + x, by + y, "#23262d");
        }
      }
      for (let k = 0; k < 3; k++) for (let x = -2 + k; x <= 2 - k; x++) put(Math.round(bb.cx) + x, by + hh + k, "#23262d");
    });
    layer(ctx, (put) => text(put, str, Math.round(bb.cx - textWidth(str, 2) / 2), by + 3, 2, "#ffb257", "#ee7a24"), [0]);
    if (e < 700) {
      ctx.globalAlpha *= clamp(1 - e / 700, 0, 1);
      const fy = Math.round(by - 12 - (e / 700) * 10);
      layer(ctx, (put) => text(put, "+1", Math.round(bb.cx - textWidth("+1", 1) / 2), fy, 1, "#ffffff", "#e4e8ee"));
    }
    ctx.globalAlpha = 1;
  }

  syncHit(): void {
    if (!this.active) return;
    const rects: Rect[] = [];
    const b = this.ball;
    if (this.canDismiss()) rects.push({ x: 0, y: 0, w: this.artW * this.S, h: this.artH * this.S });
    if ((!this.onlineMatch || this.onlineMatch.canShoot()) && (!b.moving || this.canGrabSliding()) && !this.drag) {
      const pad = 8;
      rects.push({
        x: (b.x - BALL_R) * this.S - pad,
        y: (b.y - BALL_R) * this.S - pad,
        w: BALL_R * 2 * this.S + pad * 2,
        h: BALL_R * 2 * this.S + pad * 2,
      });
    }
    rects.push(...this.ui.rects());
    const key = JSON.stringify(rects);
    if (key === this.lastHit) return;
    this.lastHit = key;
    void setHitRegions(rects);
  }

  resetScore(): void {
    setScore(0);
    resetMatch();
  }
}
