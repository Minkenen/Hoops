import { NICKNAME_TAKEN_ERROR, defaultNickname, nicknameDecision, nicknameLower, scoreDecision, weekKey } from "./logic.js";

interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}

interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}

interface DurableObjectId {}

interface DurableObjectStub {
  fetch(request: Request): Promise<Response>;
}

interface DurableObjectState {
  acceptWebSocket(ws: WebSocket, tags?: string[]): void;
}

interface Env {
  DB: D1Database;
  MP: DurableObjectNamespace;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  SESSION_SECRET: string;
  HASH_PEPPER: string;
}

type Provider = "google";

const WEB_REDIRECT = "https://minkenen.github.io/Hoops/play/";
const LS_STORE_ID = 495291;
/** Lemon Squeezy product ids (public, the license API needs no key). */
const LICENSED: Record<number, { unlock: "all" | "theme"; theme: string }> = {
  1430835: { unlock: "all", theme: "" },
  1431014: { unlock: "theme", theme: "street" },
  1431019: { unlock: "theme", theme: "arena" },
  1431020: { unlock: "theme", theme: "led" },
  1431022: { unlock: "theme", theme: "train-day" },
  1431023: { unlock: "theme", theme: "train-night" },
  1431024: { unlock: "theme", theme: "train-canyon" },
};
const PROFILE_MAX = 40_000;
const MP_RECONNECT_MS = 15_000;
const MP_ROOM_TTL_MS = 10 * 60_000;
const MP_GAMES = new Set(["speed", "horse", "t21"]);
const MP_COURTS = new Set(["Street", "Gym", "Arena"]);

const allowedOrigin = (origin: string): boolean =>
  origin === "https://minkenen.github.io" || /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

const bad = (message: string, status = 400): Response => json({ error: message }, status);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("origin") || "";
    const cors: Record<string, string> = allowedOrigin(origin)
      ? {
          "access-control-allow-origin": origin,
          "access-control-allow-headers": "authorization, content-type",
          "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
          "access-control-max-age": "86400",
          vary: "origin",
        }
      : {};
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    let res: Response;
    try {
      res = await route(request, env);
    } catch (error) {
      const message = errorMessage(error);
      res = message === "Sign in first." ? bad(message, 401) : bad(message, 500);
    }
    if (!Object.keys(cors).length) return res;
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
    return out;
  },
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Server error.";
}

async function route(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (request.method === "GET" && url.pathname === "/leaderboard") return leaderboard(request, env, url);
      if (request.method === "GET" && url.pathname === "/me") return me(request, env);
      if (request.method === "GET" && url.pathname === "/auth/start") return authStart(env, url);
      if (request.method === "GET" && url.pathname === "/auth/callback") return authCallback(env, url);
      if (request.method === "POST" && url.pathname === "/score") return score(request, env);
      if (request.method === "POST" && url.pathname === "/nickname") return nickname(request, env);
      if (request.method === "DELETE" && url.pathname === "/account") return deleteAccount(request, env);
      if (request.method === "GET" && url.pathname === "/profile") return profileGet(request, env);
      if (request.method === "PUT" && url.pathname === "/profile") return profilePut(request, env);
      if (request.method === "POST" && url.pathname === "/mp/rooms") return mpRoom(request, env);
      if (request.method === "GET" && url.pathname === "/mp/ws") return mpWs(request, env, url);
      if (request.method === "POST" && url.pathname === "/license/activate") return licenseActivate(request);
      if (request.method === "POST" && url.pathname === "/license/validate") return licenseValidate(request);
      return bad("Not found.", 404);
    } catch (error) {
      return bad(error instanceof Error ? error.message : "Server error.", 500);
    }
}

async function authStart(env: Env, url: URL): Promise<Response> {
  const provider = url.searchParams.get("provider");
  const redirectUri = url.searchParams.get("redirect_uri") || "";
  if (provider !== "google") return bad("Unsupported provider.");
  if (!redirectUri.startsWith("http://127.0.0.1:") && redirectUri !== WEB_REDIRECT) return bad("Unsupported redirect.");
  const state = await signJwt(env, { provider, redirectUri, exp: Math.floor(Date.now() / 1000) + 600 });
  const next = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  next.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
  next.searchParams.set("redirect_uri", `${url.origin}/auth/callback`);
  next.searchParams.set("response_type", "code");
  next.searchParams.set("scope", "openid");
  next.searchParams.set("state", state);
  return Response.redirect(next.toString(), 302);
}

async function authCallback(env: Env, url: URL): Promise<Response> {
  const code = url.searchParams.get("code") || "";
  const state = await verifyJwt<{ provider: Provider; redirectUri: string; exp: number }>(env, url.searchParams.get("state") || "");
  if (!code || !state || state.exp < Math.floor(Date.now() / 1000)) return bad("Sign-in expired.");
  const sub = await googleSub(env, url.origin, code);
  const player = await upsertPlayer(env, state.provider, sub);
  const token = await signJwt(env, { playerId: player.id, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 90 });
  const redirect = new URL(state.redirectUri);
  // The desktop app gets the token in the query of its own loopback address; the web page gets it in the fragment, which never reaches a server.
  if (state.redirectUri === WEB_REDIRECT) redirect.hash = `token=${token}`;
  else redirect.searchParams.set("token", token);
  return Response.redirect(redirect.toString(), 302);
}

async function googleSub(env: Env, origin: string, code: string): Promise<string> {
  const body = new URLSearchParams({
    code,
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    redirect_uri: `${origin}/auth/callback`,
    grant_type: "authorization_code",
  });
  const token = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body });
  const data = await token.json() as { id_token?: string };
  const claims = decodeJwt(data.id_token || "");
  if (!claims.sub) throw new Error("Google sign-in failed.");
  return String(claims.sub);
}

async function me(request: Request, env: Env): Promise<Response> {
  const player = await requirePlayer(request, env);
  return json({ token: bearer(request), user: { id: player.id, nickname: player.nickname } });
}

async function leaderboard(request: Request, env: Env, url: URL): Promise<Response> {
  const tab = url.searchParams.get("tab") || "global";
  if (tab !== "global" && tab !== "weekly" && tab !== "friends") return bad("Unsupported tab.");
  const player = await optionalPlayer(request, env);
  if (tab === "friends") return json({ top: [], you: null, players: 0, updatedAt: Date.now() });
  const week = weekKey();
  const table = tab === "weekly" ? "weekly_scores" : "scores";
  const where = tab === "weekly" ? "WHERE week = ?" : "";
  const params = tab === "weekly" ? [week] : [];
  const topRows = await env.DB.prepare(
    `SELECT p.id, p.nickname, s.best_score FROM ${table} s JOIN players p ON p.id = s.player_id ${where} ORDER BY s.best_score DESC, p.created_at ASC LIMIT 5`,
  ).bind(...params).all<{ id: string; nickname: string; best_score: number }>();
  const top = topRows.results.map((r, i) => ({ rank: i + 1, name: r.nickname, score: r.best_score, icon: iconFor(r.id) }));
  const count = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} ${where}`).bind(...params).first<{ n: number }>();
  let you = null;
  if (player) {
    const mine = await env.DB.prepare(`SELECT best_score FROM ${table} WHERE player_id = ? ${tab === "weekly" ? "AND week = ?" : ""}`)
      .bind(...(tab === "weekly" ? [player.id, week] : [player.id]))
      .first<{ best_score: number }>();
    if (mine) {
      const higher = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE best_score > ? ${tab === "weekly" ? "AND week = ?" : ""}`)
        .bind(...(tab === "weekly" ? [mine.best_score, week] : [mine.best_score]))
        .first<{ n: number }>();
      you = { rank: (higher?.n || 0) + 1, name: `You (${player.nickname})`, score: mine.best_score, icon: iconFor(player.id) };
    }
  }
  return json({ top, you, players: count?.n || 0, updatedAt: Date.now() });
}

async function score(request: Request, env: Env): Promise<Response> {
  const player = await requirePlayer(request, env);
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const body = await request.json();
  const previous = await env.DB.prepare("SELECT best_score, updated_at FROM scores WHERE player_id = ?").bind(player.id).first<{ best_score: number; updated_at: number }>();
  const ipRate = await env.DB.prepare("SELECT updated_at FROM score_submissions WHERE key = ?").bind(`ip:${ip}`).first<{ updated_at: number }>();
  if (ipRate && Date.now() - ipRate.updated_at < 10_000) return json({ ok: true });
  const decision = scoreDecision(body, previous, Date.now());
  if (!decision.ok) return json({ ok: true });
  const now = Date.now();
  await env.DB.prepare("INSERT OR REPLACE INTO score_submissions (key, updated_at) VALUES (?, ?)").bind(`ip:${ip}`, now).run();
  await env.DB.prepare("INSERT OR REPLACE INTO score_submissions (key, updated_at) VALUES (?, ?)").bind(`player:${player.id}`, now).run();
  await env.DB.prepare(
    `INSERT INTO scores (player_id, best_score, best_streak, throws, goals, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(player_id) DO UPDATE SET
       best_score = MAX(scores.best_score, excluded.best_score),
       best_streak = MAX(scores.best_streak, excluded.best_streak),
       throws = MAX(scores.throws, excluded.throws),
       goals = MAX(scores.goals, excluded.goals),
       updated_at = excluded.updated_at`,
  ).bind(player.id, decision.score, decision.bestStreak, decision.throws, decision.goals, now).run();
  await env.DB.prepare(
    `INSERT INTO weekly_scores (player_id, week, best_score) VALUES (?, ?, ?)
     ON CONFLICT(player_id, week) DO UPDATE SET best_score = MAX(weekly_scores.best_score, excluded.best_score)`,
  ).bind(player.id, weekKey(now), decision.score).run();
  return json({ ok: true });
}

async function nickname(request: Request, env: Env): Promise<Response> {
  const player = await requirePlayer(request, env);
  const body = await request.json() as { nickname?: string };
  const decided = nicknameDecision(body.nickname);
  if (!decided.ok) return bad(decided.error, decided.status);
  const { nickname, lower } = decided;
  const taken = await env.DB.prepare("SELECT id FROM players WHERE nickname_lower = ? AND id != ?").bind(lower, player.id).first<{ id: string }>();
  if (taken) return bad(NICKNAME_TAKEN_ERROR, 409);
  try {
    await env.DB.prepare("UPDATE players SET nickname = ?, nickname_lower = ? WHERE id = ?").bind(nickname, lower, player.id).run();
  } catch (error) {
    if (isUniqueConstraint(error)) return bad(NICKNAME_TAKEN_ERROR, 409);
    throw error;
  }
  return json({ id: player.id, nickname });
}

async function deleteAccount(request: Request, env: Env): Promise<Response> {
  const player = await requirePlayer(request, env);
  await env.DB.prepare("DELETE FROM players WHERE id = ?").bind(player.id).run();
  return json({ ok: true });
}

async function upsertPlayer(env: Env, provider: Provider, providerUserId: string): Promise<{ id: string; nickname: string }> {
  const providerHash = await sha256(`${provider}:${providerUserId}:${env.HASH_PEPPER}`);
  const existing = await env.DB.prepare("SELECT id, nickname FROM players WHERE provider_user_id_hash = ?").bind(providerHash).first<{ id: string; nickname: string }>();
  if (existing) return existing;
  for (let attempt = 0; attempt < 50; attempt++) {
    const id = crypto.randomUUID();
    const nickname = defaultNickname(providerHash, attempt);
    const lower = nicknameLower(nickname);
    if (!lower) throw new Error("Could not create nickname.");
    try {
      await env.DB.prepare("INSERT INTO players (id, provider, provider_user_id_hash, nickname, nickname_lower, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(id, provider, providerHash, nickname, lower, Date.now())
        .run();
      return { id, nickname };
    } catch (error) {
      if (!isUniqueConstraint(error)) throw error;
    }
    const racedExisting = await env.DB.prepare("SELECT id, nickname FROM players WHERE provider_user_id_hash = ?").bind(providerHash).first<{ id: string; nickname: string }>();
    if (racedExisting) return racedExisting;
  }
  throw new Error("Could not create nickname.");
}

async function optionalPlayer(request: Request, env: Env, tokenOverride?: string): Promise<{ id: string; nickname: string } | null> {
  const token = tokenOverride || bearer(request);
  if (!token) return null;
  const claims = await verifyJwt<{ playerId: string; exp: number }>(env, token);
  if (!claims || claims.exp < Math.floor(Date.now() / 1000)) return null;
  return env.DB.prepare("SELECT id, nickname FROM players WHERE id = ?").bind(claims.playerId).first<{ id: string; nickname: string }>();
}

async function requirePlayer(request: Request, env: Env, tokenOverride?: string): Promise<{ id: string; nickname: string }> {
  const player = await optionalPlayer(request, env, tokenOverride);
  if (!player) throw new Error("Sign in first.");
  return player;
}

function bearer(request: Request): string {
  return (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
}

async function signJwt(env: Env, payload: Record<string, unknown>): Promise<string> {
  const header = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64(JSON.stringify(payload));
  const sig = await hmac(env.SESSION_SECRET, `${header}.${body}`);
  return `${header}.${body}.${sig}`;
}

async function verifyJwt<T>(env: Env, token: string): Promise<T | null> {
  const [header, body, sig] = token.split(".");
  if (!header || !body || !sig) return null;
  const expected = await hmac(env.SESSION_SECRET, `${header}.${body}`);
  if (expected !== sig) return null;
  return JSON.parse(atobUrl(body)) as T;
}

async function hmac(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return b64Bytes(new Uint8Array(sig));
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function decodeJwt(token: string): Record<string, unknown> {
  const body = token.split(".")[1];
  return body ? JSON.parse(atobUrl(body)) : {};
}

function b64(value: string): string {
  return b64Bytes(new TextEncoder().encode(value));
}

function b64Bytes(bytes: Uint8Array): string {
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function atobUrl(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return atob(padded);
}

function iconFor(id: string): number {
  let n = 0;
  for (let i = 0; i < id.length; i++) n = (n + id.charCodeAt(i)) % 7;
  return n;
}

function isUniqueConstraint(error: unknown): boolean {
  return String(error instanceof Error ? error.message : error).toLowerCase().includes("unique");
}

type MpGame = "speed" | "horse" | "t21";
type MpCourt = "Street" | "Gym" | "Arena";
type MpMode = "quick" | "friend";
type MpRole = "offerer" | "answerer";

interface MpPlayer {
  id: string;
  nickname: string;
  ready: boolean;
  connected: boolean;
  role: MpRole;
  socket?: WebSocket;
  reconnectUntil?: number;
}

interface MpRoom {
  id: string;
  code?: string;
  mode: MpMode;
  game: MpGame;
  court: MpCourt;
  hostId: string;
  players: Map<string, MpPlayer>;
  createdAt: number;
  expiresAt: number;
  startsAt?: number;
  seed?: string;
}

interface MpClientMessage {
  type?: string;
  requestId?: string;
  payload?: Record<string, unknown>;
}

interface WebSocketPairConstructor {
  new (): { 0: WebSocket; 1: WebSocket };
}

declare const WebSocketPair: WebSocketPairConstructor;

export class MultiplayerHub {
  private rooms = new Map<string, MpRoom>();
  private codeToRoom = new Map<string, string>();
  private quickWaiting = new Map<MpGame, { player: { id: string; nickname: string }; socket: WebSocket; room: MpRoom }>();

  constructor(private state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/rooms") return this.createRoom(request);
    if (request.method === "GET" && url.pathname === "/ws") return this.connect(request, url);
    return bad("Not found.", 404);
  }

  private async createRoom(request: Request): Promise<Response> {
    const { player } = (await request.json().catch(() => ({}))) as { player?: { id?: string; nickname?: string } };
    if (!player?.id || !player.nickname) return bad("Sign in before playing online.", 401);
    this.sweep();
    const code = this.newCode();
    const now = Date.now();
    const room: MpRoom = {
      id: crypto.randomUUID(),
      code,
      mode: "friend",
      game: "speed",
      court: "Street",
      hostId: player.id,
      players: new Map(),
      createdAt: now,
      expiresAt: now + MP_ROOM_TTL_MS,
    };
    this.rooms.set(room.id, room);
    this.codeToRoom.set(code, room.id);
    return json({ code, expiresIn: Math.round(MP_ROOM_TTL_MS / 1000) });
  }

  private connect(request: Request, url: URL): Response {
    const player = { id: request.headers.get("x-player-id") || "", nickname: request.headers.get("x-player-nickname") || "" };
    if (!player.id || !player.nickname) return bad("Sign in before playing online.", 401);
    const mode = url.searchParams.get("mode") || "";
    const game = (url.searchParams.get("game") || "speed") as MpGame;
    const code = normalizeRoomCode(url.searchParams.get("code") || "");
    if (mode !== "quick" && mode !== "room") return bad("Unsupported multiplayer mode.");
    if (!MP_GAMES.has(game)) return bad("Unknown game.");
    this.sweep();

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.state.acceptWebSocket(server);

    if (mode === "quick") this.connectQuick(player, game, server);
    else this.connectRoom(player, code, server);
    return new Response(null, { status: 101, webSocket: client } as ResponseInit & { webSocket: WebSocket });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string") return;
    const room = this.findRoomBySocket(ws);
    if (!room) return send(ws, "error", { code: "room_not_found", message: "Room not found. Check the code and try again." });
    const player = this.findPlayerBySocket(room, ws);
    if (!player) return;
    let msg: MpClientMessage;
    try {
      msg = JSON.parse(message) as MpClientMessage;
    } catch {
      return send(ws, "error", { code: "bad_message", message: "That message was not understood." });
    }
    const payload = msg.payload || {};
    switch (msg.type) {
      case "set_game": {
        if (player.id !== room.hostId) return sendError(ws, msg, "not_host", "Only the room host can change this setting.");
        if (anyReady(room)) return sendError(ws, msg, "already_ready", "Game cannot change after ready.");
        const game = String(payload.game || "");
        if (!MP_GAMES.has(game)) return sendError(ws, msg, "bad_game", "Unknown game.");
        room.game = game as MpGame;
        broadcastLobby(room);
        break;
      }
      case "set_court": {
        if (player.id !== room.hostId) return sendError(ws, msg, "not_host", "Only the room host can change this setting.");
        if (anyReady(room)) return sendError(ws, msg, "already_ready", "Court cannot change after ready.");
        const court = String(payload.court || "");
        if (!MP_COURTS.has(court)) return sendError(ws, msg, "bad_court", "Unknown court.");
        room.court = court as MpCourt;
        broadcastLobby(room);
        break;
      }
      case "ready": {
        player.ready = payload.ready === true;
        broadcastLobby(room);
        if (room.players.size === 2 && [...room.players.values()].every((p) => p.ready && p.connected)) {
          room.startsAt = Date.now() + 3000;
          room.seed = room.seed || crypto.randomUUID();
          broadcast(room, "start_countdown", { startsAt: room.startsAt, seed: room.seed, countdownSeconds: 3 });
        }
        break;
      }
      case "signal": {
        const kind = String(payload.kind || "");
        if (kind !== "offer" && kind !== "answer" && kind !== "ice" && kind !== "renegotiate") return sendError(ws, msg, "bad_signal", "WebRTC signal message was invalid.");
        const peer = peerOf(room, player.id);
        if (peer?.socket && peer.connected) send(peer.socket, "signal", { from: player.id, kind, data: payload.data ?? {} });
        break;
      }
      case "leave": {
        this.leave(room, player.id);
        break;
      }
      case "ping":
        send(ws, "pong", { clientTime: payload.clientTime ?? null, serverTime: Date.now() }, msg.requestId);
        break;
      default:
        sendError(ws, msg, "bad_message", "That message was not understood.");
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    this.disconnect(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.disconnect(ws);
  }

  private connectQuick(player: { id: string; nickname: string }, game: MpGame, socket: WebSocket): void {
    const waiting = this.quickWaiting.get(game);
    if (waiting && waiting.player.id !== player.id && waiting.socket.readyState === 1) {
      this.quickWaiting.delete(game);
      const room = waiting.room;
      room.players.set(player.id, { id: player.id, nickname: player.nickname, ready: false, connected: true, role: "answerer", socket });
      this.rooms.set(room.id, room);
      sendPeerFound(room);
      broadcastLobby(room);
      return;
    }
    const now = Date.now();
    const room: MpRoom = {
      id: crypto.randomUUID(),
      mode: "quick",
      game,
      court: "Street",
      hostId: player.id,
      players: new Map([[player.id, { id: player.id, nickname: player.nickname, ready: false, connected: true, role: "offerer", socket }]]),
      createdAt: now,
      expiresAt: now + MP_ROOM_TTL_MS,
    };
    this.rooms.set(room.id, room);
    this.quickWaiting.set(game, { player, socket, room });
    send(socket, "searching", { game, estimatedSeconds: 20 });
  }

  private connectRoom(player: { id: string; nickname: string }, code: string, socket: WebSocket): void {
    const roomId = this.codeToRoom.get(code);
    const room = roomId ? this.rooms.get(roomId) : null;
    if (!room) return send(socket, "error", { code: "room_not_found", message: "Room not found. Check the code and try again." });
    if (Date.now() > room.expiresAt) {
      this.deleteRoom(room);
      return send(socket, "error", { code: "room_expired", message: "Room code expired." });
    }
    const existing = room.players.get(player.id);
    if (existing) {
      existing.socket = socket;
      existing.connected = true;
      existing.reconnectUntil = undefined;
      broadcast(room, "peer_reconnected", { playerId: player.id }, player.id);
      broadcastLobby(room);
      return;
    }
    if (room.players.size >= 2) return send(socket, "error", { code: "room_full", message: "Two players are already in the room." });
    const role: MpRole = room.players.size === 0 ? "offerer" : "answerer";
    room.players.set(player.id, { id: player.id, nickname: player.nickname, ready: false, connected: true, role, socket });
    if (room.players.size === 1) {
      room.hostId = player.id;
      send(socket, "room_created", { roomId: room.id, code: room.code, expiresAt: room.expiresAt });
    } else {
      sendPeerFound(room);
    }
    broadcastLobby(room);
  }

  private disconnect(ws: WebSocket): void {
    const room = this.findRoomBySocket(ws);
    if (!room) return;
    const player = this.findPlayerBySocket(room, ws);
    if (!player) return;
    player.connected = false;
    player.socket = undefined;
    player.reconnectUntil = Date.now() + MP_RECONNECT_MS;
    if (room.mode === "quick") {
      const waiting = this.quickWaiting.get(room.game);
      if (waiting?.player.id === player.id) this.quickWaiting.delete(room.game);
    }
    broadcast(room, "peer_disconnected", { playerId: player.id, reconnectUntil: player.reconnectUntil }, player.id);
    broadcastLobby(room);
  }

  private leave(room: MpRoom, playerId: string): void {
    const leaving = room.players.get(playerId);
    if (leaving?.socket) send(leaving.socket, "peer_left", { playerId });
    broadcast(room, "peer_left", { playerId }, playerId);
    this.deleteRoom(room);
  }

  private findRoomBySocket(ws: WebSocket): MpRoom | null {
    for (const room of this.rooms.values()) {
      if (this.findPlayerBySocket(room, ws)) return room;
    }
    return null;
  }

  private findPlayerBySocket(room: MpRoom, ws: WebSocket): MpPlayer | null {
    for (const player of room.players.values()) {
      if (player.socket === ws) return player;
    }
    return null;
  }

  private deleteRoom(room: MpRoom): void {
    this.rooms.delete(room.id);
    if (room.code) this.codeToRoom.delete(room.code);
    const waiting = this.quickWaiting.get(room.game);
    if (waiting?.room.id === room.id) this.quickWaiting.delete(room.game);
    for (const player of room.players.values()) {
      try {
        player.socket?.close(1000, "room closed");
      } catch {
        /* ignore */
      }
    }
  }

  private sweep(): void {
    const now = Date.now();
    for (const room of this.rooms.values()) {
      const allGone = [...room.players.values()].every((p) => !p.connected && (!p.reconnectUntil || p.reconnectUntil < now));
      if (room.expiresAt < now || allGone) this.deleteRoom(room);
    }
  }

  private newCode(): string {
    const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    const pick = (): string => alphabet[Math.floor(Math.random() * alphabet.length)];
    for (let i = 0; i < 20; i++) {
      const code = `${pick()}${pick()}${pick()}-${pick()}${pick()}${pick()}`;
      if (!this.codeToRoom.has(code)) return code;
    }
    throw new Error("Could not create room code.");
  }
}

function normalizeRoomCode(code: string): string {
  const clean = code.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return clean.length === 6 ? `${clean.slice(0, 3)}-${clean.slice(3)}` : code.toUpperCase();
}

function send(ws: WebSocket, type: string, payload: Record<string, unknown>, requestId?: string): void {
  if (ws.readyState !== 1) return;
  ws.send(JSON.stringify({ type, ...(requestId ? { requestId } : {}), payload }));
}

function sendError(ws: WebSocket, msg: MpClientMessage, code: string, message: string): void {
  send(ws, "error", { code, message }, msg.requestId);
}

function broadcast(room: MpRoom, type: string, payload: Record<string, unknown>, exceptId?: string): void {
  for (const player of room.players.values()) {
    if (player.id !== exceptId && player.socket && player.connected) send(player.socket, type, payload);
  }
}

function broadcastLobby(room: MpRoom): void {
  broadcast(room, "lobby_state", lobbyPayload(room));
}

function lobbyPayload(room: MpRoom): Record<string, unknown> {
  return {
    roomId: room.id,
    game: room.game,
    court: room.court,
    players: [...room.players.values()].map((p) => ({ id: p.id, nickname: p.nickname, ready: p.ready, connected: p.connected })),
  };
}

function sendPeerFound(room: MpRoom): void {
  const players = [...room.players.values()];
  if (players.length !== 2) return;
  for (const player of players) {
    const peer = players.find((p) => p.id !== player.id)!;
    if (!player.socket) continue;
    send(player.socket, "peer_found", {
      roomId: room.id,
      game: room.game,
      role: player.role,
      you: { id: player.id, nickname: player.nickname, ball: player.role === "offerer" ? "you" : "opp" },
      peer: { id: peer.id, nickname: peer.nickname, ball: player.role === "offerer" ? "opp" : "you" },
    });
  }
}

function anyReady(room: MpRoom): boolean {
  return [...room.players.values()].some((p) => p.ready);
}

function peerOf(room: MpRoom, playerId: string): MpPlayer | null {
  return [...room.players.values()].find((p) => p.id !== playerId) || null;
}

async function profileGet(request: Request, env: Env): Promise<Response> {
  const player = await requirePlayer(request, env);
  const row = await env.DB.prepare("SELECT data, updated_at FROM profiles WHERE player_id = ?").bind(player.id).first<{ data: string; updated_at: number }>();
  if (!row) return json({ profile: null, updatedAt: 0 });
  return json({ profile: JSON.parse(row.data), updatedAt: row.updated_at });
}

async function profilePut(request: Request, env: Env): Promise<Response> {
  const player = await requirePlayer(request, env);
  const text = await request.text();
  if (text.length > PROFILE_MAX) return bad("Profile is too large.", 413);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return bad("Invalid profile.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return bad("Invalid profile.");
  const now = Date.now();
  await env.DB.prepare(
    "INSERT INTO profiles (player_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(player_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
  ).bind(player.id, JSON.stringify(body), now).run();
  return json({ ok: true, updatedAt: now });
}

async function mpRoom(request: Request, env: Env): Promise<Response> {
  const player = await requirePlayer(request, env);
  const hub = env.MP.get(env.MP.idFromName("v1"));
  const res = await hub.fetch(
    new Request("https://mp.local/rooms", {
      method: "POST",
      body: JSON.stringify({ player }),
      headers: { "content-type": "application/json" },
    }),
  );
  return new Response(res.body, res);
}

async function mpWs(request: Request, env: Env, url: URL): Promise<Response> {
  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") return bad("Expected WebSocket.", 426);
  const player = await requirePlayer(request, env, url.searchParams.get("token") || undefined);
  const mode = url.searchParams.get("mode") || "";
  const game = url.searchParams.get("game") || "speed";
  const code = (url.searchParams.get("code") || "").toUpperCase();
  if (mode !== "quick" && mode !== "room") return bad("Unsupported multiplayer mode.");
  if (!MP_GAMES.has(game)) return bad("Unknown game.");
  if (mode === "room" && !/^[A-Z0-9]{3}-?[A-Z0-9]{3}$/.test(code)) return bad("Room not found. Check the code and try again.", 404);
  const hub = env.MP.get(env.MP.idFromName("v1"));
  const next = new URL("https://mp.local/ws");
  next.searchParams.set("mode", mode);
  next.searchParams.set("game", game);
  if (code) next.searchParams.set("code", code);
  return hub.fetch(
    new Request(next, {
      headers: {
        upgrade: "websocket",
        "x-player-id": player.id,
        "x-player-nickname": player.nickname,
      },
    }),
  );
}

async function lemon(path: "activate" | "validate", fields: Record<string, string>): Promise<Record<string, any>> {
  const res = await fetch(`https://api.lemonsqueezy.com/v1/licenses/${path}`, {
    method: "POST",
    headers: { accept: "application/json" },
    body: new URLSearchParams(fields),
  });
  return (await res.json().catch(() => ({}))) as Record<string, any>;
}

function licenseMatch(meta: Record<string, any> | undefined): { unlock: "all" | "theme"; theme: string } | null {
  if (!meta || meta.store_id !== LS_STORE_ID) return null;
  return LICENSED[Number(meta.product_id)] ?? null;
}

async function licenseActivate(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as { key?: string };
  const key = String(body.key || "").trim();
  if (!key) return bad("Enter your license key.");
  const r = await lemon("activate", { license_key: key, instance_name: "Hoops in the browser" });
  if (r.activated !== true) return bad(String(r.error || "That license key was not accepted."), 400);
  const match = licenseMatch(r.meta);
  if (!match) return bad("That license key is for a different product.");
  return json({ instance_id: String(r.instance?.id || ""), unlock: match.unlock, theme_id: match.theme });
}

async function licenseValidate(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as { key?: string };
  const key = String(body.key || "").trim();
  if (!key) return json({ valid: false });
  const r = await lemon("validate", { license_key: key });
  return json({ valid: r.valid === true && licenseMatch(r.meta) !== null });
}
