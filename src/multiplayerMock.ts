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

export const MULTIPLAYER_MOCK: boolean = import.meta.env.VITE_MULTIPLAYER === "1" || import.meta.env.VITE_MULTIPLAYER_MOCK === "1";
const SERVER_URL = ((import.meta.env.VITE_LEADERBOARD_URL as string | undefined) || "").trim();

import type { GameId, MpCourt, OnlineMatchInit } from "./onlineMatch";
export type { GameId, MpCourt };
export type MpScreen = "start" | "quick" | "found" | "friend" | "created" | "join" | "notfound" | "lobby" | "countdown" | "reconnect" | "gone" | "timeout";

const GAMES: Record<GameId, { name: string; rule: string; tag: string; small: string }> = {
  speed: { name: "Speedball", rule: "You each get a ball. First to 10 baskets wins.", tag: "First to 10", small: "First to 10" },
  horse: { name: "HORSE", rule: "Take turns shooting. Miss and you get a letter. Spell HORSE and you are out.", tag: "Miss = a letter", small: "Miss = a letter" },
  t21: { name: "21", rule: "Take turns, one shot each. First to 21 points wins.", tag: "First to 21", small: "Take turns" },
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
  /** The quick-match screen is showing a room being joined with a code. */
  joining = false;
  peerName = "Mia";
  private seed = "";
  private myId = "";
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
        this.game = v as GameId;
        this.conn?.send("set_game", { game: this.game });
        this.host.render();
        break;
      case "court":
        this.court = v as MpCourt;
        this.conn?.send("set_court", { court: this.court });
        this.host.render();
        break;
      case "quick":
        this.startQuick();
        break;
      case "friend":
        this.go("friend");
        break;
      case "create":
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
    void (async () => {
      try {
        const room = await this.mustConn().createRoom();
        this.code = room.code;
        this.go("created");
        await this.mustConn().connectRoom(room.code);
      } catch (e) {
        this.fail(e instanceof Error ? e.message : "Could not create room.");
      }
    })();
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
        this.peerId = m.payload.peer.id;
        this.connected = true;
        this.go("found");
        break;
      case "lobby_state":
        this.game = m.payload.game;
        this.court = m.payload.court;
        this.players = m.payload.players;
        this.me = this.players.find((p) => p.nickname === this.host.nickname())?.ready ?? this.me;
        this.opp = this.players.some((p) => p.nickname !== this.host.nickname() && p.ready);
        if (this.screen !== "created" && this.screen !== "found" && this.screen !== "quick") this.host.render();
        break;
      case "start_countdown":
        this.countdown = m.payload.countdownSeconds;
        this.seed = m.payload.seed;
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
        const conn = this.conn;
        this.conn = null;
        this.stopTimersOnly();
        this.host.startOnlineMatch(
          { game: this.game, court: this.court, opponent: this.peerName, seed: this.seed || "online", myId: this.myId, peerId: this.peerId },
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

  private modes(): string {
    const icon: Record<GameId, string> = {
      speed: `<div class="ic">${this.ball("you", 16)}${this.ball("opp", 16)}</div>`,
      horse: `<div class="ic">H·O</div>`,
      t21: `<div class="ic">21</div>`,
    };
    return `<div class="mp-modes">${(Object.keys(GAMES) as GameId[])
      .map((g) => `<button class="mp-mode${this.game === g ? " on" : ""}" data-a="mp:game" data-v="${g}">${icon[g]}<b>${GAMES[g].name}</b><small>${GAMES[g].small}</small></button>`)
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

  private board(who: "me" | "opp"): string {
    if (this.game === "horse") return `<div class="mp-score">${[..."HORSE"].map((c) => `<span class="l">${c}</span>`).join("")}</div>`;
    const goal = this.game === "speed" ? 10 : 21;
    return `<div class="mp-score"><span class="mp-pill">0 / ${goal}</span></div><div class="mp-turn">${this.game === "speed" ? "Own ball" : who === "me" ? "Shoots first (coin flip)" : ""}</div>`;
  }

  private body(): string {
    const nick = this.host.nickname();
    switch (this.screen) {
      case "start":
        return `<div class="h4" style="margin-top:0">Game</div>${this.modes()}${this.rule()}
<button class="pb pri mp-big" data-a="mp:quick">${this.ball("you", 32)}<span><b>Quick match</b><small>Play a random player now</small></span></button>
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
        return `<button class="pb pri mp-big" data-a="mp:create">${this.ball("you", 32)}<span><b>Create a room</b><small>You get a code to share</small></span></button>
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
${this.screen === "notfound" ? '<div class="err">Room not found. Check the code and try again.</div>' : ""}
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
    const banner =
      s === "reconnect"
        ? `<div class="mp-banner warn">${this.peerName} lost connection. Reconnecting… <b>0:${String(this.reconnectLeft).padStart(2, "0")}</b></div>`
        : s === "gone"
          ? `<div class="mp-banner bad">${this.peerName} left the match.</div>`
          : s === "timeout"
            ? `<div class="mp-banner bad">Connection lost. Could not reconnect to ${this.peerName}.</div>`
            : "";
    const oppPill =
      s === "reconnect"
        ? `<span class="mp-pill warn"><i></i>Reconnecting</span>`
        : s === "gone" || s === "timeout"
          ? `<span class="mp-pill bad"><i></i>Offline</span>`
          : `<span class="mp-pill${this.direct ? "" : " warn"}"><i></i>${this.direct ? "Direct link ready" : "Server lobby"}</span>`;
    const ready = this.me && !(s === "gone" || s === "timeout");
    const cards = `<div class="mp-vs"><div class="mp-pl${this.me ? " ready" : ""}">${this.ball("you", 48)}<b>${nick}</b><div class="hn">You</div><span class="mp-pill"><i></i>Connected</span>${this.board("me")}
<div style="margin-top:6px"><button class="pb${ready ? " on" : ""}" data-a="mp:ready"${s === "lobby" ? "" : " disabled"}>${ready ? "Ready ✓" : "Ready"}</button></div></div>
<div class="mp-vsx">VS</div>
<div class="mp-pl${this.opp ? " ready" : ""}">${this.ball("opp", 48)}<b>${this.peerName}</b><div class="hn">Opponent</div>${oppPill}${this.board("opp")}
<div style="margin-top:6px"><span class="mp-pill${this.opp ? "" : " warn"}"><i></i>${this.opp ? "Ready" : "Not ready"}</span></div></div></div>`;
    if (s === "countdown") {
      return `${cards}<div class="mp-c hn">${GAMES[this.game].name} · ${GAMES[this.game].tag}</div><div class="mp-cd">${this.countdown > 0 ? this.countdown : "GO!"}</div>`;
    }
    const settings = `<div class="h4">Game <span class="hn">(the host picks)</span></div>${this.modes()}${this.rule()}
<div class="h4">Court</div><div class="mp-seg">${(["Street", "Gym", "Arena"] as const)
      .map((c) => `<button class="pb${this.court === c ? " on" : ""}" data-a="mp:court" data-v="${c}">${c}</button>`)
      .join("")}</div><div class="hn" style="margin-top:6px">Both players see the same court and hoop.</div>`;
    let actions: string;
    if (s === "lobby") actions = `<button class="pb full" data-a="mp:leave" style="text-align:center;margin-top:10px">Leave</button>`;
    else if (s === "reconnect")
      actions = `<button class="pb full" data-a="mp:sim" data-v="reconnect" style="text-align:center;margin-top:10px">Keep waiting</button><button class="pb full" data-a="mp:leave" style="text-align:center">Leave</button>`;
    else
      actions = `<button class="pb pri mp-big" data-a="mp:menu" style="justify-content:center;margin-top:10px"><span><b>Back to menu</b></span></button><button class="pb full" data-a="mp:quick" style="text-align:center">Find another player</button>`;
    const sim =
      `<div class="mp-sim hn">Test states: <button class="pb" data-a="mp:sim" data-v="reconnect">Lose connection</button><button class="pb" data-a="mp:sim" data-v="gone">Opponent leaves</button>` +
      (s === "lobby" ? "" : `<button class="pb" data-a="mp:sim" data-v="restore">Reset</button>`) +
      `</div>`;
    return `${banner}${cards}${settings}${actions}${sim}`;
  }

  /** The whole window. The first screen steps back through ui.back(); the others through back(). */
  html(): string {
    return `<div class="px win" data-hit style="width:min(430px,94vw)">
<div class="wt"><span class="wl"><button class="pb" data-a="back" aria-label="Back">←</button>${this.title()}${this.screen === "quick" || this.screen === "found" || this.screen === "created" ? "" : ""}</span><button class="pb" data-a="close" aria-label="Close">×</button></div>
<div class="wb mp">${this.body()}</div></div>`;
  }
}
