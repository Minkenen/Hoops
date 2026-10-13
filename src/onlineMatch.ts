// An online match in progress: the rules for Speedball, HORSE and 21, whose turn it is, and the messages to and from the other player.
// The game itself (ball, hoop, court) is played locally on each computer. Each side reports the result of every shot of its own
// over the direct WebRTC channel, and both sides apply the same rules to both players, so the scores always agree.
// TODO(multiplayer): show the other player's ball in flight too (send the throw), and a rematch button.
import type { MultiplayerConnection, MpServerMessage } from "./multiplayerClient";

export type GameId = "speed" | "horse" | "t21";
export type MpCourt = "Street" | "Gym" | "Arena";

export interface OnlineMatchInit {
  game: GameId;
  court: MpCourt;
  opponent: string;
  seed: string;
  myId: string;
  peerId: string;
}

export interface OnlineMatchHost {
  /** Something changed: redraw the scoreboard. */
  changed(): void;
  /** A short message for the player. */
  toast(m: string): void;
  /** The other player's ball has stopped (HORSE and 21: it is one ball, so it is now yours to shoot from there). nx = across the screen, 0 to 1. */
  peerRest(nx: number): void;
  /** The other player's ball, in flight. */
  ball(p: OpponentBall): void;
  /** The other player has started a shot. */
  peerShotStarted(): void;
  /** The other player's shot is over. */
  peerShotEnded(goal: boolean): void;
  peerSound?(name: "bounce" | "wall" | "board" | "rim", intensity: number): void;
}

export interface OnlineShot {
  x: number; y: number; vx: number; vy: number; width: number; height: number; floorY: number; gs: number;
  hoopX: number; hoopY: number; hoopL: number; hoopR: number;
  boardL: number; boardR: number; boardT: number; boardB: number;
}

/**
 * Where the other player's ball is. "free" uses normalized court coordinates so phones and desktop screens with
 * different aspect ratios still show the ball in the same relative place.
 */
export type OpponentBall =
  | { kind: "arc"; dx: number; dy: number; side: "left" | "right"; rimH: number; ang: number }
  | { kind: "free"; nx: number; ny?: number; h?: number; ang: number };

export interface OnlineResult {
  won: boolean;
  reason: string;
}

export const HORSE = "HORSE";
const SPEED_GOAL = 10;
const T21_GOAL = 21;

const hash = (s: string): number => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

export class OnlineMatch {
  readonly game: GameId;
  readonly court: MpCourt;
  readonly opponent: string;
  readonly seed: string;
  scoreMe = 0;
  scoreOpp = 0;
  lettersMe = 0;
  lettersOpp = 0;
  streakMe = 0;
  streakOpp = 0;
  /** Shared completed-shot number. Both clients advance it from the same result message. */
  round = 0;
  private awaitingRest = false;
  /** Whose shot it is. In Speedball both shoot at once. */
  turn: "me" | "opp" | "both";
  over: OnlineResult | null = null;
  /** The opponent has lost the connection for a moment. */
  peerAway = false;
  private inFlight = false;
  /** HORSE and 21 use one ball: the other player's shot is still rolling, so it is not yet your turn to shoot. */
  private peerBusy = false;
  private localShotId = 0;
  private peerShotId = -1;
  private peerResultId = -1;
  private serverSeq = 0;
  private shotStartedAt = 0;
  private busyTimer = 0;
  private beat = 0;

  constructor(
    init: OnlineMatchInit,
    private conn: MultiplayerConnection | null,
    private host: OnlineMatchHost,
  ) {
    this.game = init.game;
    this.court = init.court;
    this.opponent = init.opponent;
    this.seed = init.seed;
    if (init.game === "speed") this.turn = "both";
    else {
      // a coin flip both sides agree on: the same seed and the same two ids give the same answer
      const ids = [init.myId, init.peerId].sort();
      this.turn = ids[hash(init.seed) % 2] === init.myId ? "me" : "opp";
    }
    conn?.setHandlers({
      onMessage: (m) => this.onServer(m),
      onDirectMessage: (d) => this.onPeer(d),
      onClose: () => this.onClosed(),
      onError: () => undefined,
    });
    // keeps the server connection from going quiet
    this.beat = window.setInterval(() => this.conn?.send("ping"), 25000);
  }

  /** The other player's shot is still rolling (HORSE and 21). */
  get waitingForPeer(): boolean {
    return this.peerBusy;
  }

  get goalText(): string {
    return this.game === "speed" ? `First to ${SPEED_GOAL}` : this.game === "t21" ? `First to ${T21_GOAL}` : "Miss = a letter";
  }

  /** Can the player start a shot now? */
  canShoot(): boolean {
    return !this.over && !this.inFlight && !this.awaitingRest && !this.peerBusy && (this.turn === "both" || this.turn === "me");
  }

  /** Called when the player lets go of the ball. */
  localShot(shot: OnlineShot): void {
    this.inFlight = true;
    this.shotStartedAt = performance.now();
    const shotId = this.localShotId++;
    this.sendMatchEvent({ type: "shot", shotId, ...shot });
    this.host.changed();
  }

  /** Called when the shot is over: it went in (far = from a long way off) or it missed. */
  localResult(goal: boolean, far = false): void {
    if (!this.inFlight || this.over) return;
    this.inFlight = false;
    this.awaitingRest = this.game !== "speed";
    this.apply("me", goal, far);
    // with the totals as they stand now: the other player takes our own score from us, so the two screens cannot drift apart
    this.sendMatchEvent({ type: "result", shotId: this.localShotId - 1, resultT: Math.round(performance.now() - this.shotStartedAt), goal, far, score: this.scoreMe, letters: this.lettersMe });
    this.host.changed();
  }

  /** HORSE and 21: the player's ball has stopped; the other player continues with it from here. */
  sendRest(nx: number): void {
    if (this.game === "speed" || !this.awaitingRest) return;
    this.awaitingRest = false;
    if (!this.over) this.turn = "opp";
    this.sendMatchEvent({ type: "rest", nx });
    this.host.changed();
  }

  sendSound(name: "bounce" | "wall" | "board" | "rim", intensity: number): void {
    this.conn?.sendPeer("sound", { name, intensity });
  }

  /** While the player's own shot is in flight (HORSE and 21): tells the other player where the ball is. */
  sendBall(p: OpponentBall): void {
    this.conn?.sendPeer("ball", p as unknown as Record<string, unknown>);
  }

  private sendMatchEvent(event: Record<string, unknown>): void {
    this.conn?.send("match_event", { seq: this.serverSeq++, event });
  }

  private apply(who: "me" | "opp", goal: boolean, far: boolean): void {
    const me = who === "me";
    this.round++;
    if (me) this.streakMe = goal ? this.streakMe + 1 : 0;
    else this.streakOpp = goal ? this.streakOpp + 1 : 0;
    if (this.game === "speed") {
      if (goal) {
        if (me) this.scoreMe++;
        else this.scoreOpp++;
      }
      if ((me ? this.scoreMe : this.scoreOpp) >= SPEED_GOAL) this.finish(me, me ? "You got to 10 first" : `${this.opponent} got to 10 first`);
      return;
    }
    if (this.game === "horse") {
      if (!goal) {
        if (me) this.lettersMe++;
        else this.lettersOpp++;
        if ((me ? this.lettersMe : this.lettersOpp) >= HORSE.length) this.finish(!me, me ? "You spelled HORSE" : `${this.opponent} spelled HORSE`);
      }
    } else if (goal) {
      const pts = far ? 2 : 1;
      if (me) this.scoreMe += pts;
      else this.scoreOpp += pts;
      if ((me ? this.scoreMe : this.scoreOpp) >= T21_GOAL) this.finish(me, me ? "You got to 21 first" : `${this.opponent} got to 21 first`);
    }
  }

  /** Looks again at who has got there, after a total was taken from the other player. */
  private checkEnd(): void {
    if (this.over) return;
    if (this.game === "speed" && this.scoreOpp >= SPEED_GOAL) this.finish(false, `${this.opponent} got to 10 first`);
    else if (this.game === "t21" && this.scoreOpp >= T21_GOAL) this.finish(false, `${this.opponent} got to 21 first`);
    else if (this.game === "horse" && this.lettersOpp >= HORSE.length) this.finish(true, `${this.opponent} spelled HORSE`);
  }

  private finish(won: boolean, reason: string): void {
    this.over = { won, reason };
  }

  private onPeer(d: unknown): void {
    if (typeof d !== "object" || d === null) return;
    const m = d as { type?: string; payload?: { shotId?: unknown; goal?: unknown; far?: unknown; nx?: unknown; score?: unknown; letters?: unknown } & Record<string, unknown> };
    if (m.type === "result" && !this.over) {
      if (this.game !== "speed" && (this.turn !== "opp" || this.peerBusy)) return;
      const shotId = m.payload?.shotId;
      if (typeof shotId !== "number" || !Number.isInteger(shotId) || shotId !== this.peerShotId || shotId <= this.peerResultId) return;
      this.peerResultId = shotId;
      const goal = m.payload?.goal === true;
      this.apply("opp", goal, m.payload?.far === true);
      // the other player's own score is what they say it is
      if (typeof m.payload?.score === "number") this.scoreOpp = m.payload.score;
      if (typeof m.payload?.letters === "number") this.lettersOpp = m.payload.letters;
      this.checkEnd();
      if (this.game !== "speed") {
        this.peerBusy = true;
        window.clearTimeout(this.busyTimer);
      }
      this.host.toast(goal ? `${this.opponent} scored` : `${this.opponent} missed`);
      this.host.peerShotEnded(goal);
      this.host.changed();
    } else if (m.type === "shot" && !this.over) {
      if (this.game !== "speed" && this.turn !== "opp") return;
      const shotId = m.payload?.shotId;
      if (typeof shotId !== "number" || !Number.isInteger(shotId) || shotId <= this.peerShotId) return;
      this.peerShotId = shotId;
      this.host.peerShotStarted();
      this.host.changed();
    } else if (m.type === "ball" && !this.over && m.payload) {
      if (this.game !== "speed" && this.turn !== "opp") return;
      const p = m.payload as Record<string, unknown>;
      const ang = typeof p.ang === "number" ? p.ang : 0;
      if (p.kind === "free" && typeof p.nx === "number" && (typeof p.ny === "number" || typeof p.h === "number")) {
        this.host.ball({
          kind: "free",
          nx: p.nx,
          ny: typeof p.ny === "number" ? p.ny : undefined,
          h: typeof p.h === "number" ? p.h : undefined,
          ang,
        });
      } else if (typeof p.dx === "number" && typeof p.dy === "number" && (p.side === "left" || p.side === "right") && typeof p.rimH === "number") {
        this.host.ball({ kind: "arc", dx: p.dx, dy: p.dy, side: p.side, rimH: p.rimH, ang });
      }
    } else if (m.type === "rest" && m.payload && typeof m.payload.nx === "number") {
      if (this.game === "speed" || this.turn !== "opp" || !this.peerBusy) return;
      window.clearTimeout(this.busyTimer);
      this.peerBusy = false;
      if (!this.over) this.turn = "me";
      this.host.peerRest(m.payload.nx);
      this.host.changed();
    } else if (m.type === "sound" && !this.over && m.payload) {
      const { name, intensity } = m.payload;
      if (this.game !== "speed" && this.turn !== "opp") return;
      if ((name === "bounce" || name === "wall" || name === "board" || name === "rim") && typeof intensity === "number" && Number.isFinite(intensity)) {
        this.host.peerSound?.(name, Math.max(0, Math.min(1, intensity)));
      }
    } else if (m.type === "leave" && !this.over) {
      this.finish(true, `${this.opponent} left the match`);
      this.host.changed();
    }
  }

  private onServer(m: MpServerMessage): void {
    if (m.type === "match_event") {
      this.onPeer(m.payload.event);
    } else if (m.type === "peer_disconnected") {
      this.peerAway = true;
      this.host.changed();
    } else if (m.type === "peer_reconnected") {
      this.peerAway = false;
      this.host.changed();
    } else if (m.type === "peer_left" && !this.over) {
      this.finish(true, `${this.opponent} left the match`);
      this.host.changed();
    }
  }

  private onClosed(): void {
    if (this.over) return;
    this.finish(false, "The connection was lost");
    this.host.changed();
  }

  /** Leaves the match: tells the other player and closes the connections. */
  leave(): void {
    window.clearInterval(this.beat);
    window.clearTimeout(this.busyTimer);
    this.conn?.sendPeer("leave");
    this.conn?.send("bye");
    this.conn?.close();
    this.conn = null;
  }

  // ---------- what the scoreboard shows ----------

  yourTurnText(): string {
    if (this.over) return "";
    if (this.game === "speed") return "";
    return this.turn === "me" ? "Your turn" : `${this.opponent}'s turn`;
  }
}
