// Online multiplayer UI. With VITE_LEADERBOARD_URL and sign-in it uses the real signaling server;
// WebRTC/match physics are still TODO, so the final "start match" remains a handoff point.
// It follows mockups/multiplayer-1-start.html, -2-room.html and -3-lobby.html and is only shown when VITE_MULTIPLAYER_MOCK=1.
//
// The real thing later (backend by Codex, see server/leaderboard/MULTIPLAYER.md):
//   quick match  -> WebSocket to /mp/ws?mode=quick&game=...
//   friend room  -> POST /mp/rooms, then /mp/ws?mode=room&code=...
//   lobby        -> ready flags and rule changes travel over the signaling server for now
//   reconnect    -> ICE restart through the signalling channel for about 15 s (TODO: replace simulate())

import { createMultiplayerConnection, type MpLobbyPlayer, type MpServerMessage, type MultiplayerConnection } from "./multiplayerClient";

const esc = (t: string): string => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

export const MULTIPLAYER_MOCK: boolean = !import.meta.env.DEV ? import.meta.env.VITE_MULTIPLAYER !== "0" : import.meta.env.VITE_MULTIPLAYER === "1" || import.meta.env.VITE_MULTIPLAYER_MOCK === "1";
const SERVER_URL = LEADERBOARD_SERVER_URL;

import { LEADERBOARD_SERVER_URL } from "./config";
import type { GameId, MpCourt, OnlineMatchInit } from "./onlineMatch";
import { mark } from "./stats";
export type { GameId, MpCourt };
export type MpScreen = "start" | "quick" | "found" | "friend" | "created" | "join" | "notfound" | "lobby" | "countdown" | "reconnect" | "gone" | "timeout";

const GAMES: Record<GameId, { name: string; rule: string; tag: string; small: string }> = {
  speed: { name: "Speedball", rule: "You each get a ball. First to 10 baskets wins.", tag: "First to 10", small: "First to 10" },
  horse: { name: "HORSE", rule: "Take turns with the same ball. Miss and you get a letter. Spell HORSE and you are out.", tag: "Miss = a letter", small: "Miss = a letter" },
  t21: { name: "21", rule: "Take turns with the same ball, one shot each. 1 point, 2 from far away. First to 21 wins.", tag: "First to 21", small: "Take turns" },
};

/** What the mock needs from the window around it. */
export interface MpHost {
  render(): void;
  isOpen(): boolean;
  close(): void;
  openMenu(): void;
  toast(m: string, ms?: number): void;
  nickname(): string;
  /** The countdown reached GO: the match takes over the connection. */
  startOnlineMatch(init: OnlineMatchInit, conn: MultiplayerConnection | null): void;
}

export class MultiplayerMock {
  screen: MpScreen = "start";
  game: GameId = "speed";
  court: MpCourt = "Street";
  code = "";
  joinCode = "";
  copied = false;
  elapsed = 0;
  countdown = 3;
  reconnectLeft = 12;
  me = false;
  opp = false;
  connected = false;
  direct = false;
  error = "";
  /** This match is in a room that was made or joined with a code (not a quick match). */
  private friendFlow = false;
  /** The quick-match screen is showing a room being joined with a code. */
  joining = false;
  peerName = "Mia";
  private seed = "";
  /** HORSE and 21: who shoots first, decided by the server. */
  private firstPlayerId: string | null = null;
  /** The match has started (once only: a second start would make a match without a connection). */
  private started = false;
  private myId = "";
  /** You are the host: only the host picks the game and the court. */
  isHost = true;
  private peerId = "";
  private players: MpLobbyPlayer[] = [];
  private timers: number[] = [];
  private conn: MultiplayerConnection | null = createMultiplayerConnection(
    SERVER_URL,
    (m) => this.onServer(m),
    () => this.onServerClose(),
    (m) => this.fail(m),
    () => this.onDirectOpen(),
    (m) => this.onDirectMessage(m),
  );

  constructor(private host: MpHost) {}

  /** Opens at the first screen. */
  open(): void {
    this.stop();
    this.started = false;
    this.conn ??= this.connect();
    this.screen = "start";
    this.joinCode = "";
    this.me = this.opp = false;
    this.direct = false;
  }

  stop(): void {
    this.timers.forEach((t) => window.clearTimeout(t));
    this.timers = [];
    this.conn?.close();
  }

  private connect(): MultiplayerConnection | null {
    return createMultiplayerConnection(
      SERVER_URL,
      (m) => this.onServer(m),
      () => this.onServerClose(),
      (m) => this.fail(m),
      () => this.onDirectOpen(),
      (m) => this.onDirectMessage(m),
    );
  }

  private later(ms: number, f: () => void): void {
    this.timers.push(
      window.setTimeout(() => {
        if (this.host.isOpen()) f();
      }, ms),
    );
  }

  private go(s: MpScreen): void {
    this.error = "";
    if (s !== "quick") this.joining = false;
    this.screen = s;
    this.host.render();
  }

  /** Back from a screen. Returns false when the window itself should step back (we are at the first screen). */
  back(): boolean {
    this.stop();
    switch (this.screen) {
      case "start":
        return false;
      case "created":
      case "join":
      case "notfound":
        this.go("friend");
        return true;
      default:
        this.me = this.opp = false;
        this.direct = false;
        this.go("start");
        return true;
    }
  }

  setJoinCode(v: string): void {
    this.joinCode = v.replace(/[^a-zA-Z0-9-]/g, "").toUpperCase();
  }

  /** Handles a click on an element with data-a="mp:<action>" and an optional data-v. */
  click(action: string, v?: string): void {
    switch (action) {
      case "game":
        if (this.screen !== "start" && !this.isHost) return;
        this.game = v as GameId;
        this.me = this.opp = false; // a change takes everybody's "ready" back
        this.conn?.send("set_game", { game: this.game });
        this.host.render();
        break;
      case "court":
        if (!this.isHost) return;
        this.court = v as MpCourt;
        this.me = this.opp = false;
        this.conn?.send("set_court", { court: this.court });
        this.host.render();
        break;
      case "quick":
        this.friendFlow = false;
        this.startQuick();
        break;
      case "friend":
        this.go("friend");
        break;
      case "create":
        this.friendFlow = true;
        this.createRoom();
        break;
      case "copy":
        this.copied = true;
        try {
          void navigator.clipboard?.writeText(this.code);
        } catch {
          /* the mock does not need the clipboard */
        }
        this.host.render();
        this.later(1400, () => {
          this.copied = false;
          this.host.render();
        });
        break;
      case "joinscreen":
        this.go("join");
        break;
      case "join":
        this.friendFlow = true;
        this.join();
        break;
      case "cancel":
        this.stop();
        this.go("start");
        break;
      case "lobby":
        this.me = this.opp = false;
        this.go("lobby");
        break;
      case "ready":
        this.setReady();
        break;
      case "sim":
        this.simulate(v ?? "");
        break;
      case "menu":
        this.stop();
        this.host.openMenu();
        break;
      case "leave":
        this.stop();
        this.me = this.opp = false;
        this.direct = false;
        this.go("start");
        break;
    }
  }

  private startQuick(): void {
    this.stop();
    this.elapsed = 0;
    this.screen = "quick";
    this.connected = false;
    this.direct = false;
    this.players = [];
    this.host.render();
    this.conn = this.connect();
    void this.conn?.connectQuick(this.game).catch((e) => this.fail(e instanceof Error ? e.message : "Could not start quick match."));
    const tick = (): void => {
      this.elapsed++;
      this.host.render();
      this.later(1000, tick);
    };
    this.later(1000, tick);
  }

  private createRoom(): void {
    this.stop();
    this.direct = false;
    this.conn = this.connect();
    // the server makes the room when we connect, and answers with room_created (see onServer)
    void this.mustConn().connectCreate(this.game).catch((e) => this.fail(e instanceof Error ? e.message : "Could not create room."));
  }

  private join(): void {
    const clean = this.joinCode.replace(/-/g, "");
    if (clean.length < 6) {
      this.go("notfound");
      return;
    }
    this.stop();
    this.screen = "quick";
    this.joining = true;
    this.direct = false;
    this.host.render();
    // if nothing answers, say so instead of leaving the screen as it is
    this.later(12000, () => {
      if (this.screen === "quick" && this.joining) {
        this.go("notfound");
        this.host.toast("Could not join the room. Ask your friend to keep their room window open, and check the code.", 4500);
      }
    });
    this.conn = this.connect();
    void this.conn?.connectRoom(this.joinCode).catch((e) => this.fail(e instanceof Error ? e.message : "Could not join room."));
  }

  private setReady(): void {
    this.me = !this.me;
    this.conn?.send("ready", { ready: this.me });
    this.host.render();
  }

  // TODO(multiplayer): real connection states from the peer connection (disconnected, failed) and the signalling channel.
  private simulate(what: string): void {
    this.stop();
    if (what === "reconnect") {
      this.reconnectLeft = 12;
      this.go("reconnect");
      const tick = (): void => {
        this.reconnectLeft--;
        if (this.reconnectLeft <= 0) {
          this.go("timeout");
          return;
        }
        this.host.render();
        this.later(1000, tick);
      };
      this.later(1000, tick);
    } else if (what === "restore") {
      this.me = this.opp = false;
      this.go("lobby");
    } else this.go(what === "gone" ? "gone" : "timeout");
  }

  private mustConn(): MultiplayerConnection {
    if (!this.conn) throw new Error("Multiplayer server is not configured.");
    return this.conn;
  }

  private fail(message: string): void {
    this.error = message;
    if (message.includes("Room not found")) this.screen = "notfound";
    else this.host.toast(message, 3200);
    this.host.render();
  }

  private onServerClose(): void {
    if (this.screen === "quick" || this.screen === "created" || this.screen === "lobby" || this.screen === "countdown") this.fail("Multiplayer connection closed.");
  }

  private onServer(m: MpServerMessage): void {
    switch (m.type) {
      case "room_created":
        this.code = m.payload.code;
        this.go("created");
        break;
      case "searching":
        this.screen = "quick";
        this.host.render();
        break;
      case "peer_found":
        this.game = m.payload.game;
        this.peerName = m.payload.peer.nickname;
        this.myId = m.payload.you.id;
        this.isHost = m.payload.role === "offerer";
        this.peerId = m.payload.peer.id;
        this.connected = true;
        this.go("found");
        break;
      case "lobby_state":
        this.game = m.payload.game;
        this.court = m.payload.court;
        this.players = m.payload.players;
        {
          // who is who comes from the player ids (names can be the same or change); the server's word on "ready" always wins
          const mine = this.players.find((p) => (this.myId ? p.id === this.myId : p.nickname === this.host.nickname()));
          this.me = mine?.ready ?? false;
          this.opp = this.players.some((p) => p !== mine && p.ready);
        }
        if (this.screen !== "created" && this.screen !== "found" && this.screen !== "quick") this.host.render();
        break;
      case "start_countdown":
        // the server decides the game and the court: both players must play the same rules
        if (this.started) break;
        if (m.payload.game) this.game = m.payload.game;
        if (m.payload.court) this.court = m.payload.court;
        this.countdown = m.payload.countdownSeconds;
        this.seed = m.payload.seed;
        this.firstPlayerId = m.payload.firstPlayerId ?? null;
        this.go("countdown");
        this.tickCountdownTo(m.payload.startsAt);
        break;
      case "peer_disconnected":
        this.peerName = this.peerName || "Opponent";
        this.reconnectLeft = Math.max(1, Math.ceil((m.payload.reconnectUntil - Date.now()) / 1000));
        this.go("reconnect");
        break;
      case "peer_reconnected":
        this.go("lobby");
        break;
      case "peer_left":
        this.go("gone");
        break;
      case "error":
        this.fail(m.payload.message);
        break;
    }
  }

  private onDirectOpen(): void {
    this.direct = true;
    this.conn?.sendPeer("hello", { game: this.game, court: this.court, nickname: this.host.nickname() });
    this.host.render();
  }

  private onDirectMessage(data: unknown): void {
    if (typeof data !== "object" || data === null) return;
    this.direct = true;
  }

  private tickCountdownTo(startsAt: number): void {
    this.stopTimersOnly();
    const tick = (): void => {
      const left = Math.ceil((startsAt - Date.now()) / 1000);
      this.countdown = left > 0 ? left : 0;
      this.host.render();
      if (left > 0) this.later(250, tick);
      else {
        // the match takes over the connection; this window gets a fresh one next time
        if (this.started) return;
        this.started = true;
        if (this.friendFlow) mark("friendRoom");
        const conn = this.conn;
        this.conn = null;
        this.stopTimersOnly();
        this.host.startOnlineMatch(
          { game: this.game, court: this.court, opponent: this.peerName, seed: this.seed || "online", myId: this.myId, peerId: this.peerId, firstPlayerId: this.firstPlayerId },
          conn,
        );
      }
    };
    tick();
  }

  private stopTimersOnly(): void {
    this.timers.forEach((t) => window.clearTimeout(t));
    this.timers = [];
  }

  // ---------- markup ----------

  private rule(): string {
    return `<div class="mp-rule">${GAMES[this.game].rule}</div>`;
  }

  private ball(kind: "you" | "opp" | "gold", size: number): string {
    return `<canvas data-art="ball-${kind}" width="${size}" height="${size}"></canvas>`;
  }

  private modes(enabled = true): string {
    const icon: Record<GameId, string> = {
      speed: `<div class="ic">${this.ball("you", 16)}${this.ball("opp", 16)}</div>`,
      horse: `<div class="ic">H·O</div>`,
      t21: `<div class="ic">21</div>`,
    };
    return `<div class="mp-modes">${(Object.keys(GAMES) as GameId[])
      .map((g) => `<button class="mp-mode${this.game === g ? " on" : ""}"${enabled ? ` data-a="mp:game" data-v="${g}"` : " disabled"}>${icon[g]}<b>${GAMES[g].name}</b><small>${GAMES[g].small}</small></button>`)
      .join("")}</div>`;
  }

  private title(): string {
    const t: Partial<Record<MpScreen, string>> = {
      start: "Play online",
      quick: "Quick match",
      found: "Quick match",
      friend: "Play with friend",
      created: "Play with friend",
      join: "Play with friend",
      notfound: "Play with friend",
    };
    return t[this.screen] ?? "Online match";
  }

  private body(): string {
    const nick = this.host.nickname();
    switch (this.screen) {
      case "start":
        return `<div class="h4" style="margin-top:0">Game</div>${this.modes()}${this.rule()}
<button class="pb mp-big" data-a="mp:quick">${this.ball("you", 32)}<span><b>Quick match</b><small>Play a random player now</small></span></button>
<button class="pb mp-big" data-a="mp:friend">${this.ball("opp", 32)}<span><b>Play with friend</b><small>Make a room code or join one</small></span></button>
<button class="pb full" data-a="back" style="text-align:center;margin-top:8px">Back</button>
<div class="mp-note">Peer-to-peer match. A small server only helps players find each other.</div>`;
      case "quick":
        return `<div class="mp-search">${this.ball("you", 32)}${this.ball("opp", 32)}${this.ball("gold", 32)}</div>
<div class="mp-c"><b>${this.joining ? "Joining the room…" : `Looking for a ${GAMES[this.game].name} player…`}</b>${this.joining ? "" : `<div class="hn">0:${String(this.elapsed + 7).padStart(2, "0")} · about 20 s</div>`}</div>
<button class="pb full" data-a="mp:cancel" style="text-align:center;margin-top:12px">Cancel</button>`;
      case "found":
        return `<div class="mp-c" style="margin:14px 0"><span class="mp-pill"><i></i>Player found</span>
<div class="mp-vs"><div class="mp-pl">${this.ball("you", 48)}<b>${nick}</b></div><div class="mp-vsx">VS</div><div class="mp-pl">${this.ball("opp", 48)}<b>${this.peerName}</b></div></div>
<div class="hn">${this.direct ? `Direct link ready with ${this.peerName}` : `Connecting directly to ${this.peerName}…`}</div><div class="hn" style="margin-top:4px">${GAMES[this.game].name} · ${GAMES[this.game].tag}</div></div>
<button class="pb pri mp-big" data-a="mp:lobby" style="justify-content:center"><span><b>Continue to lobby</b></span></button>`;
      case "friend":
        return `<button class="pb mp-big" data-a="mp:create">${this.ball("you", 32)}<span><b>Create a room</b><small>You get a code to share</small></span></button>
<div class="h4">Or join a friend</div>
<button class="pb mp-big" data-a="mp:joinscreen">${this.ball("opp", 32)}<span><b>Join with code</b><small>Type the code from your friend</small></span></button>`;
      case "created":
        return `<div class="mp-c hn" style="margin-top:6px">Your room code</div>
<div class="mp-code">${[...this.code].map((c) => (c === "-" ? '<span class="d">-</span>' : `<span>${c}</span>`)).join("")}</div>
<button class="pb full" data-a="mp:copy" style="text-align:center">${this.copied ? "Copied!" : "Copy code"}</button>
<div class="mp-c" style="margin:12px 0 4px"><span class="mp-pill warn"><i></i>Waiting for your friend…</span></div>
<div class="hn mp-c">Send them the code. The room closes in 10:00.</div>
<button class="pb full" data-a="mp:friend" style="text-align:center;margin-top:10px">Close room</button>`;
      case "join":
      case "notfound":
        return `<div class="h4" style="margin-top:0">Room code</div>
<input class="mp-in" id="mpcode" maxlength="7" placeholder="ABC-123" value="${this.joinCode}" autocomplete="off" spellcheck="false">
${this.screen === "notfound" && !this.error ? '<div class="err">Room not found. Check the code and try again.</div>' : ""}
${this.error ? `<div class="err">${this.error}</div>` : ""}
<button class="pb pri mp-big" data-a="mp:join" style="justify-content:center"><span><b>Join</b></span></button>
<button class="pb full" data-a="mp:friend" style="text-align:center">Back</button>`;
      case "countdown":
      case "lobby":
      case "reconnect":
      case "gone":
      case "timeout":
        return this.lobby();
    }
  }

  private lobby(): string {
    const s = this.screen;
    const nick = this.host.nickname();
    const gone = s === "gone" || s === "timeout";
    const g = GAMES[this.game];
    let status: { t: string; k: string };
    if (s === "countdown") status = { t: this.countdown > 0 ? `Starting in ${this.countdown}…` : "GO!", k: "ok" };
    else if (s === "reconnect") status = { t: `${this.peerName} lost connection. Reconnecting… 0:${String(this.reconnectLeft).padStart(2, "0")}`, k: "warn" };
    else if (s === "gone") status = { t: `${this.peerName} left the match.`, k: "bad" };
    else if (s === "timeout") status = { t: `Connection lost. Could not reconnect to ${this.peerName}.`, k: "bad" };
    else if (this.me && !this.opp) status = { t: `You are ready. Waiting for ${this.peerName}…`, k: "ok" };
    else if (!this.me && this.opp) status = { t: `${this.peerName} is ready. Your turn to press Ready.`, k: "warn" };
    else status = { t: "Press Ready when you want to play.", k: "" };
    const oppPill =
      s === "reconnect"
        ? `<span class="mp-pill warn"><i></i>Reconnecting</span>`
        : gone
          ? `<span class="mp-pill bad"><i></i>${s === "gone" ? "Left" : "Offline"}</span>`
          : `<span class="mp-pill${this.opp ? "" : " warn"}"><i></i>${this.opp ? "Ready" : "Not ready"}</span>`;
    const mine = this.me && !gone;
    const players = `<div class="h4" style="margin-top:0">Players</div>
<div class="mp-pc${mine ? " rd" : ""}">${this.ball("you", 32)}<div><b>${esc(nick)}</b><div class="hn">You${this.isHost ? " · host" : ""}</div></div><span class="mp-pill${mine ? "" : " warn"}"><i></i>${mine ? "Ready" : "Not ready"}</span></div>
<div class="mp-pc${this.opp ? " rd" : ""}">${this.ball("opp", 32)}<div><b>${esc(this.peerName)}</b><div class="hn">Opponent</div></div>${oppPill}</div>
<button class="mp-ready${mine ? " done" : ""}" data-a="mp:ready"${s === "lobby" ? "" : " disabled"}>${s === "countdown" ? (this.countdown > 0 ? this.countdown : "GO!") : gone ? "Match ended" : mine ? "Ready ✓" : "READY"}</button>
${gone ? `<button class="pb full" data-a="mp:menu" style="text-align:center;margin-top:8px">Back to menu</button><button class="pb full" data-a="mp:quick" style="text-align:center">Find another player</button>` : `<a class="mp-link" data-a="mp:leave">Leave</a>`}`;
    const modes = (Object.keys(GAMES) as GameId[])
      .map((id) => `<button class="mp-gm${this.game === id ? " on" : ""}"${this.isHost && s === "lobby" ? ` data-a="mp:game" data-v="${id}"` : " disabled"}><b>${GAMES[id].name}</b><div class="hn">${GAMES[id].tag}</div></button>`)
      .join("");
    const courts = (["Street", "Gym", "Arena"] as const)
      .map((c) => `<button class="mp-ct${this.court === c ? " on" : ""}"${this.isHost && s === "lobby" ? ` data-a="mp:court" data-v="${c}"` : " disabled"}><canvas data-art="court-${c}" width="48" height="28"></canvas><b>${c}</b></button>`)
      .join("");
    const settings = `<div class="h4" style="margin-top:0">Game <span class="hn">${this.isHost ? "(you pick)" : "(the host picks)"}</span></div><div class="mp-gms">${modes}</div><div class="hn" style="margin:6px 2px 0">${g.rule}</div>
<div class="h4">Court</div><div class="mp-cts">${courts}</div>`;
    const wait = s === "reconnect" ? `<button class="pb full" data-a="mp:sim" data-v="reconnect" style="text-align:center;margin-top:8px">Keep waiting</button>` : "";
    return `<div class="mp-banner${status.k ? " " + status.k : ""}" style="margin:0 0 10px">${status.t}</div>
<div class="mp-two"><div>${players}${wait}</div><div>${settings}</div></div>`;
  }

  private wide(): boolean {
    return ["lobby", "countdown", "reconnect", "gone", "timeout"].includes(this.screen);
  }

  /** The whole window. The first screen steps back through ui.back(); the others through back(). */
  html(): string {
    return `<div class="px win" data-hit style="width:min(${this.wide() ? 600 : 430}px,94vw)">
<div class="wt"><span class="wl"><button class="pb" data-a="back" aria-label="Back">←</button>${this.title()}${this.screen === "quick" || this.screen === "found" || this.screen === "created" ? "" : ""}</span><button class="pb" data-a="close" aria-label="Close">×</button></div>
<div class="wb mp">${this.body()}</div></div>`;
  }
}
