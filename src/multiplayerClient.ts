import { leaderboardSessionToken } from "./ipc";
import type { GameId } from "./multiplayerMock";

export type MpSignalKind = "offer" | "answer" | "ice" | "renegotiate";
export type MpServerMessage =
  | { type: "room_created"; payload: { roomId: string; code: string; expiresAt: number } }
  | { type: "searching"; payload: { game: GameId; estimatedSeconds: number } }
  | { type: "peer_found"; payload: { roomId: string; game: GameId; role: "offerer" | "answerer"; you: MpPlayerInfo; peer: MpPlayerInfo } }
  | { type: "lobby_state"; payload: { roomId: string; game: GameId; court: "Street" | "Gym" | "Arena"; players: MpLobbyPlayer[] } }
  | { type: "start_countdown"; payload: { startsAt: number; seed: string; countdownSeconds: number } }
  | { type: "signal"; payload: { from: string; kind: MpSignalKind; data: unknown } }
  | { type: "peer_disconnected"; payload: { playerId: string; reconnectUntil: number } }
  | { type: "peer_reconnected"; payload: { playerId: string } }
  | { type: "peer_left"; payload: { playerId: string } }
  | { type: "error"; payload: { code: string; message: string } };

export interface MpPlayerInfo {
  id: string;
  nickname: string;
  rank?: number;
  ball?: string;
}

export interface MpLobbyPlayer {
  id: string;
  nickname: string;
  ready: boolean;
  connected: boolean;
}

export class MultiplayerConnection {
  private ws: WebSocket | null = null;
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private role: "offerer" | "answerer" | null = null;

  /** Hands the connection to someone else (the lobby gives it to the match). */
  setHandlers(h: { onMessage?: (m: MpServerMessage) => void; onClose?: () => void; onError?: (message: string) => void; onDirectMessage?: (data: unknown) => void }): void {
    if (h.onMessage) this.onMessage = h.onMessage;
    if (h.onClose) this.onClose = h.onClose;
    if (h.onError) this.onError = h.onError;
    if (h.onDirectMessage) this.onDirectMessage = h.onDirectMessage;
  }

  get directOpen(): boolean {
    return this.dc?.readyState === "open";
  }

  constructor(
    private serverUrl: string,
    private onMessage: (m: MpServerMessage) => void,
    private onClose: () => void,
    private onError: (message: string) => void,
    private onDirectOpen: () => void = () => {},
    private onDirectMessage: (data: unknown) => void = () => {},
  ) {}

  close(): void {
    const ws = this.ws;
    this.ws = null;
    try {
      ws?.close(1000, "closed");
    } catch {
      /* ignore */
    }
    this.closePeer();
  }

  send(type: string, payload: Record<string, unknown> = {}): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type, payload }));
  }

  sendPeer(type: string, payload: Record<string, unknown> = {}): void {
    if (!this.dc || this.dc.readyState !== "open") return;
    this.dc.send(JSON.stringify({ type, payload }));
  }

  async createRoom(): Promise<{ code: string; expiresIn: number }> {
    const token = await this.token();
    const res = await fetch(`${this.baseHttp()}/mp/rooms`, {
      method: "POST",
      headers: { accept: "application/json", authorization: `Bearer ${token}` },
    });
    const data = (await res.json().catch(() => ({}))) as { code?: string; expiresIn?: number; error?: string };
    if (!res.ok || !data.code) throw new Error(data.error || "Could not create room.");
    return { code: data.code, expiresIn: Number(data.expiresIn) || 600 };
  }

  async connectQuick(game: GameId): Promise<void> {
    await this.connect(`/mp/ws?mode=quick&game=${encodeURIComponent(game)}`);
  }

  /** Makes a room and joins it in one step; the server answers with room_created and the code. */
  async connectCreate(): Promise<void> {
    await this.connect("/mp/ws?mode=room&create=1");
  }

  async connectRoom(code: string): Promise<void> {
    await this.connect(`/mp/ws?mode=room&code=${encodeURIComponent(code)}`);
  }

  private async connect(path: string): Promise<void> {
    const token = await this.token();
    this.close();
    const sep = path.includes("?") ? "&" : "?";
    const ws = new WebSocket(`${this.baseWs()}${path}${sep}token=${encodeURIComponent(token)}`);
    this.ws = ws;
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(String(event.data)) as MpServerMessage;
        void this.handleMessage(msg);
      } catch {
        this.onError("That multiplayer message was not understood.");
      }
    };
    ws.onclose = () => {
      if (this.ws === ws) this.onClose();
    };
    ws.onerror = () => this.onError("Could not connect to multiplayer.");
  }

  private async handleMessage(msg: MpServerMessage): Promise<void> {
    try {
      if (msg.type === "peer_found") {
        this.onMessage(msg);
        await this.startPeer(msg.payload.role);
        return;
      }
      if (msg.type === "signal") {
        await this.handleSignal(msg.payload.kind, msg.payload.data);
        return;
      }
      this.onMessage(msg);
    } catch (e) {
      this.onError(e instanceof Error ? e.message : "Could not connect directly to the other player.");
    }
  }

  private async startPeer(role: "offerer" | "answerer"): Promise<void> {
    this.closePeer();
    this.role = role;
    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    this.pc = pc;
    pc.onicecandidate = (event) => {
      if (event.candidate) this.send("signal", { kind: "ice", data: event.candidate.toJSON() });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed") this.onError("Could not connect directly to the other player.");
    };
    pc.ondatachannel = (event) => this.setupDataChannel(event.channel);
    if (role === "offerer") {
      this.setupDataChannel(pc.createDataChannel("game", { ordered: true }));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.send("signal", { kind: "offer", data: offer });
    }
  }

  private setupDataChannel(channel: RTCDataChannel): void {
    this.dc = channel;
    channel.onopen = () => this.onDirectOpen();
    channel.onmessage = (event) => {
      try {
        this.onDirectMessage(JSON.parse(String(event.data)));
      } catch {
        /* A bad game packet should not break the menu. */
      }
    };
  }

  private async handleSignal(kind: MpSignalKind, data: unknown): Promise<void> {
    if (!this.pc) await this.startPeer(this.role || "answerer");
    const pc = this.pc;
    if (!pc) return;
    if (kind === "offer") {
      await pc.setRemoteDescription(data as RTCSessionDescriptionInit);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.send("signal", { kind: "answer", data: answer });
    } else if (kind === "answer") {
      await pc.setRemoteDescription(data as RTCSessionDescriptionInit);
    } else if (kind === "ice") {
      await pc.addIceCandidate(data as RTCIceCandidateInit);
    }
  }

  private closePeer(): void {
    const dc = this.dc;
    const pc = this.pc;
    this.dc = null;
    this.pc = null;
    this.role = null;
    try {
      dc?.close();
    } catch {
      /* ignore */
    }
    try {
      pc?.close();
    } catch {
      /* ignore */
    }
  }

  private async token(): Promise<string> {
    const token = await leaderboardSessionToken();
    if (!token) throw new Error("Sign in before playing online.");
    return token;
  }

  private baseHttp(): string {
    return this.serverUrl.replace(/\/$/, "");
  }

  private baseWs(): string {
    const base = this.baseHttp();
    if (base.startsWith("https://")) return `wss://${base.slice("https://".length)}`;
    if (base.startsWith("http://")) return `ws://${base.slice("http://".length)}`;
    return base;
  }
}

export function createMultiplayerConnection(
  serverUrl: string,
  onMessage: (m: MpServerMessage) => void,
  onClose: () => void,
  onError: (message: string) => void,
  onDirectOpen?: () => void,
  onDirectMessage?: (data: unknown) => void,
): MultiplayerConnection | null {
  const url = serverUrl.trim();
  return url ? new MultiplayerConnection(url, onMessage, onClose, onError, onDirectOpen, onDirectMessage) : null;
}
