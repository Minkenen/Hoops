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

  constructor(
    private serverUrl: string,
    private onMessage: (m: MpServerMessage) => void,
    private onClose: () => void,
    private onError: (message: string) => void,
  ) {}

  close(): void {
    const ws = this.ws;
    this.ws = null;
    try {
      ws?.close(1000, "closed");
    } catch {
      /* ignore */
    }
  }

  send(type: string, payload: Record<string, unknown> = {}): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type, payload }));
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
        this.onMessage(JSON.parse(String(event.data)) as MpServerMessage);
      } catch {
        this.onError("That multiplayer message was not understood.");
      }
    };
    ws.onclose = () => {
      if (this.ws === ws) this.onClose();
    };
    ws.onerror = () => this.onError("Could not connect to multiplayer.");
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
): MultiplayerConnection | null {
  const url = serverUrl.trim();
  return url ? new MultiplayerConnection(url, onMessage, onClose, onError) : null;
}
