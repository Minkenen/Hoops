// An online match in progress. The server keeps the match: whose turn it is, every shot's result, the scores and who has won.
// The app tells the server where it shoots the ball from and how fast, shows the ball flying on its own screen, and follows the
// state the server sends to both players. The direct connection between the players only carries what is drawn (the ball, sounds).
import type { MpMatchState, MultiplayerConnection, MpServerMessage } from "./multiplayerClient";

export type GameId = "speed" | "horse" | "t21";
export type MpCourt = "Street" | "Gym" | "Arena";

export interface OnlineMatchInit {
  game: GameId;
  court: MpCourt;
  opponent: string;
  seed: string;
  myId: string;
  peerId: string;
  /** HORSE and 21: who shoots first (the server decides). */
  firstPlayerId?: string | null;
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

/** What the hand did: where the ball was on the floor and how it left. The server works out the rest (the hoop, the result). */
export interface OnlineShot {
  artW: number;
  artH: number;
  floorY: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  gs: number;
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

export class OnlineMatch {
  readonly game: GameId;
  readonly court: MpCourt;
  readonly opponent: string;
  readonly seed: string;
  readonly myId: string;
  readonly peerId: string;
  scoreMe = 0;
  scoreOpp = 0;
  lettersMe = 0;
  lettersOpp = 0;
  streakMe = 0;
  streakOpp = 0;
  /** Results so far (HORSE and 21: both players' together, the next hoop follows from it). */
  round = 0;
  /** Results of my own shots so far (Speedball: gives my next hoop). */
  localRound = 0;
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
  private lastSeq = -1;
  private lastState: MpMatchState | null = null;
  private restSent = false;
  private beat = 0;

  private conn: MultiplayerConnection | null;
  private host: OnlineMatchHost;

  constructor(init: OnlineMatchInit, conn: MultiplayerConnection | null, host: OnlineMatchHost) {
    this.conn = conn;
    this.host = host;
    this.game = init.game;
    this.court = init.court;
    this.opponent = init.opponent;
    this.seed = init.seed;
    this.myId = init.myId;
    this.peerId = init.peerId;
    if (init.game === "speed") this.turn = "both";
    else this.turn = init.firstPlayerId === init.myId ? "me" : "opp";
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

  /** Called when the player lets go of the ball: the server gets where it was and how it left, and plays the shot itself. */
  localShot(shot: OnlineShot): void {
    this.inFlight = true;
    this.sendEvent({ type: "shot", shotId: this.localShotId++, ...shot });
    this.host.changed();
  }

  /**
   * The shot looks over on this screen (a goal or a miss). The result itself comes from the server, to both players,
   * when it has played the shot: what this screen saw is only the picture of it.
   */
  localResult(_goal: boolean, _far = false): void {
    /* nothing to count here */
  }

  /** HORSE and 21: the player's ball has stopped; the other player continues with it from here. */
  sendRest(nx: number): void {
    if (this.game === "speed" || !this.awaitingRest || this.restSent || this.over) return;
    this.restSent = true;
    this.sendEvent({ type: "rest", nx });
  }

  sendSound(name: "bounce" | "wall" | "board" | "rim", intensity: number): void {
    this.conn?.sendPeer("sound", { name, intensity });
  }

  /** While the player's own shot is in flight (HORSE and 21): tells the other player where the ball is. */
  sendBall(p: OpponentBall): void {
    this.conn?.sendPeer("ball", p as unknown as Record<string, unknown>);
  }

  private sendEvent(event: Record<string, unknown>): void {
    this.conn?.send("match_event", { event });
  }

  /** The server's state for both players: everything the scoreboard and the turn depend on comes from here. */
  private applyState(st: MpMatchState): void {
    if (st.seq <= this.lastSeq) return; // an old one
    const before = this.lastState;
    this.lastSeq = st.seq;
    this.lastState = st;
    const me = this.myId;
    const peer = this.peerId;
    this.scoreMe = st.scores[me] ?? 0;
    this.scoreOpp = st.scores[peer] ?? 0;
    this.lettersMe = st.letters[me] ?? 0;
    this.lettersOpp = st.letters[peer] ?? 0;
    this.streakMe = st.streaks[me] ?? 0;
    this.streakOpp = st.streaks[peer] ?? 0;
    this.round = st.round;
    this.localRound = st.rounds[me] ?? 0;
    this.turn = st.turn === null ? "both" : st.turn === me ? "me" : "opp";
    this.inFlight = (st.active[me] ?? null) !== null;
    this.awaitingRest = st.awaitingRest === me;
    if (!this.awaitingRest) this.restSent = false;
    this.peerBusy = st.awaitingRest === peer || (this.game !== "speed" && (st.active[peer] ?? null) !== null);

    const last = st.last;
    const peerShot = (st.active[peer] ?? null) !== null && (before?.active[peer] ?? null) !== st.active[peer];
    if (peerShot && !st.over) this.host.peerShotStarted();
    if (last?.type === "result" && last.by === peer && last.shotId !== undefined && last.shotId !== (before?.last?.type === "result" && before.last.by === peer ? before.last.shotId : -1)) {
      this.host.toast(last.goal ? `${this.opponent} scored` : `${this.opponent} missed`);
      this.host.peerShotEnded(last.goal === true);
    }
    if (before?.awaitingRest === peer && st.awaitingRest !== peer && !st.over && this.turn === "me") this.host.peerRest(st.restNx);
    if (st.over) {
      const won = st.over.winnerId === me;
      this.over = { won, reason: this.reasonText(st.over.reason, won) };
    }
    this.host.changed();
  }

  /** The text for how the match ended, from the player's side. */
  private reasonText(reason: string, won: boolean): string {
    if (reason === "spelled HORSE") return won ? `${this.opponent} spelled HORSE` : "You spelled HORSE";
    if (reason === "left the match" || reason === "lost the connection") return `${this.opponent} ${reason}`;
    return won ? `You ${reason}` : `${this.opponent} ${reason}`;
  }

  private onPeer(d: unknown): void {
    if (typeof d !== "object" || d === null) return;
    // Shot, result and rest are the server's business: nothing the other player sends straight to this app can change the match.
    const m = d as { type?: string; payload?: { name?: unknown; intensity?: unknown } & Record<string, unknown> };
    if (m.type === "ball" && !this.over && m.payload) {
      const p = m.payload as unknown as OpponentBall & { kind?: string };
      this.host.ball(p as OpponentBall);
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
    if (m.type === "match_state") {
      this.applyState(m.payload.state);
    } else if (m.type === "error") {
      this.onServerError(m.payload);
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

  /** The server did not accept something. It follows with the real state, so the match goes on from there. */
  private onServerError(e: { code: string; message: string; shotId?: number | null }): void {
    if (this.over) return;
    if (e.code === "bad_rest") this.restSent = false;
    if (e.shotId !== undefined && e.shotId !== null) this.inFlight = false;
    this.host.toast(e.message || "That was not accepted.");
    this.host.changed();
  }

  private finish(won: boolean, reason: string): void {
    this.over = { won, reason };
  }

  private onClosed(): void {
    if (this.over) return;
    this.finish(false, "The connection was lost");
    this.host.changed();
  }

  /** Leaves the match: tells the other player and closes the connections. */
  leave(): void {
    window.clearInterval(this.beat);
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
