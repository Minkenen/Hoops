import { MIN_CLIENT_VERSION, NICKNAME_TAKEN_ERROR, defaultNickname, nicknameDecision, nicknameLower, scoreDecision, versionAtLeast, weekKey } from "./logic.js";
import { MAX_REPLAY_BYTES, hasClientGeometry, simulateReplayShot, verifyReplay } from "./replay.js";

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
  ADMIN_TOKEN?: string;
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
const MP_PROTOCOL = "2";

const allowedOrigin = (origin: string): boolean =>
  origin === "https://minkenen.github.io" ||
  // the desktop app's own window (macOS and Windows)
  origin === "tauri://localhost" || origin === "http://tauri.localhost" || origin === "https://tauri.localhost" ||
  /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);

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
      if (request.method === "GET" && url.pathname === "/entitlements") return entitlements(request, env);
      if (request.method === "GET" && url.pathname === "/admin/flags") return adminFlags(request, env);
      if (request.method === "POST" && url.pathname === "/admin/player") return adminPlayer(request, env);
      if (request.method === "GET" && url.pathname === "/auth/start") return authStart(env, url);
      if (request.method === "GET" && url.pathname === "/auth/callback") return authCallback(env, url);
      if (request.method === "POST" && url.pathname === "/score") return score(request, env);
      if (request.method === "POST" && url.pathname === "/replay/session") return replaySession(request, env);
      if (request.method === "POST" && url.pathname === "/replay") return replay(request, env);
      if (request.method === "POST" && url.pathname === "/nickname") return nickname(request, env);
      if (request.method === "POST" && url.pathname === "/color") return setColor(request, env);
      if (request.method === "DELETE" && url.pathname === "/account") return deleteAccount(request, env);
      if (request.method === "GET" && url.pathname === "/profile") return profileGet(request, env);
      if (request.method === "PUT" && url.pathname === "/profile") return profilePut(request, env);
      if (request.method === "POST" && url.pathname === "/mp/rooms") return mpRoom(request, env);
      if (request.method === "GET" && url.pathname === "/mp/ws") return mpWs(request, env, url);
      if (request.method === "POST" && url.pathname === "/donate-event") return donateEvent(request, env);
      if (request.method === "POST" && url.pathname === "/bug") return bugReport(request, env);
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
  return json({ token: bearer(request), user: { id: player.id, nickname: player.nickname, color: player.color ?? null } });
}

async function entitlements(request: Request, env: Env): Promise<Response> {
  const player = await requirePlayer(request, env);
  const row = await env.DB.prepare("SELECT data FROM profiles WHERE player_id = ?").bind(player.id).first<{ data: string }>();
  let licenses: unknown[] = [];
  try {
    const profile = row ? JSON.parse(row.data) as { licenses?: unknown[] } : null;
    licenses = Array.isArray(profile?.licenses) ? profile.licenses : [];
  } catch {
    licenses = [];
  }
  const checked = await Promise.all(licenses.map(async (license) => {
    const key = typeof (license as { key?: unknown })?.key === "string" ? String((license as { key: string }).key).trim() : "";
    if (!key) return null;
    const result = await lemon("validate", { license_key: key });
    const match = result.valid === true ? licenseMatch(result.meta) : null;
    return match ? { unlock: match.unlock, theme: match.theme } : null;
  }));
  const valid = checked.filter(Boolean);
  await env.DB.prepare("INSERT INTO entitlement_checks (player_id, checked_at, valid_count, all_access) VALUES (?, ?, ?, ?)")
    .bind(player.id, Date.now(), valid.length, valid.some((l) => l?.unlock === "all") ? 1 : 0).run();
  return json({ all: valid.some((l) => l?.unlock === "all"), themes: valid.filter((l) => l?.unlock === "theme").map((l) => l?.theme).filter(Boolean) });
}

async function flag(env: Env, playerId: string | null, kind: string, detail: string, version: string): Promise<void> {
  await env.DB.prepare("INSERT INTO cheat_flags (created_at, player_id, kind, detail, version) VALUES (?, ?, ?, ?, ?)")
    .bind(Date.now(), playerId, kind, detail.slice(0, 500), version || null).run();
}

function adminAuthorized(request: Request, env: Env): boolean {
  return Boolean(env.ADMIN_TOKEN && request.headers.get("authorization") === `Bearer ${env.ADMIN_TOKEN}`);
}

async function adminFlags(request: Request, env: Env): Promise<Response> {
  if (!adminAuthorized(request, env)) return bad("Forbidden.", 403);
  const rows = await env.DB.prepare("SELECT id, created_at, player_id, kind, detail, version FROM cheat_flags ORDER BY id DESC LIMIT 200").all();
  return json({ flags: rows.results });
}

async function adminPlayer(request: Request, env: Env): Promise<Response> {
  if (!adminAuthorized(request, env)) return bad("Forbidden.", 403);
  const body = await request.json().catch(() => ({})) as { playerId?: string; hidden?: boolean };
  if (!body.playerId || typeof body.hidden !== "boolean") return bad("Invalid player request.");
  await env.DB.prepare("UPDATE players SET hidden = ? WHERE id = ?").bind(body.hidden ? 1 : 0, body.playerId).run();
  return json({ ok: true });
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
    `SELECT p.id, p.nickname, p.color, s.best_score FROM ${table} s JOIN players p ON p.id = s.player_id ${where ? `${where} AND` : "WHERE"} p.hidden = 0 ORDER BY s.best_score DESC, p.created_at ASC LIMIT 5`,
  ).bind(...params).all<{ id: string; nickname: string; color: number | null; best_score: number }>();
  const top = topRows.results.map((r, i) => ({ rank: i + 1, name: r.nickname, score: r.best_score, icon: iconFor(r.id, r.color) }));
  const count = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} s JOIN players p ON p.id = s.player_id ${where ? `${where} AND` : "WHERE"} p.hidden = 0`).bind(...params).first<{ n: number }>();
  let you = null;
  if (player) {
    const mine = await env.DB.prepare(`SELECT best_score FROM ${table} WHERE player_id = ? ${tab === "weekly" ? "AND week = ?" : ""}`)
      .bind(...(tab === "weekly" ? [player.id, week] : [player.id]))
      .first<{ best_score: number }>();
    if (mine) {
      const higher = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE best_score > ? ${tab === "weekly" ? "AND week = ?" : ""}`)
        .bind(...(tab === "weekly" ? [mine.best_score, week] : [mine.best_score]))
        .first<{ n: number }>();
      you = { rank: (higher?.n || 0) + 1, name: `You (${player.nickname})`, score: mine.best_score, icon: iconFor(player.id, player.color) };
    }
  }
  return json({ top, you, players: count?.n || 0, updatedAt: Date.now() });
}

async function score(request: Request, env: Env): Promise<Response> {
  const player = await requirePlayer(request, env);
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const body = await request.json();
  const previous = await env.DB.prepare("SELECT best_score, best_streak, throws, goals, updated_at, version FROM scores WHERE player_id = ?").bind(player.id).first<{ best_score: number; best_streak: number; throws: number; goals: number; updated_at: number; version: string }>();
  const ipRate = await env.DB.prepare("SELECT updated_at FROM score_submissions WHERE key = ?").bind(`ip:${ip}`).first<{ updated_at: number }>();
  if (ipRate && Date.now() - ipRate.updated_at < 10_000) return json({ ok: true });
  const now = Date.now();
  const version = typeof body?.version === "string" ? body.version.slice(0, 20) : "";
  const replaySessionId = typeof body?.replaySessionId === "string" ? body.replaySessionId : "";
  const replay = replaySessionId ? await env.DB.prepare("SELECT player_id, shots, goals FROM replays WHERE session_id = ? AND used_at IS NULL").bind(replaySessionId).first<{ player_id: string; shots: number; goals: number }>() : null;
  const expectedThrows = (previous?.throws || 0) + (replay?.shots || 0);
  const expectedGoals = (previous?.goals || 0) + (replay?.goals || 0);
  if (!replay || replay.player_id !== player.id || Number(body?.throws) !== expectedThrows || Number(body?.goals) !== expectedGoals) {
    await flag(env, player.id, "score_replay", "Score was not linked to a verified replay.", version);
    return json({ ok: true });
  }
  if (version && !versionAtLeast(version)) return json({ ok: true });
  const weekly = await env.DB.prepare("SELECT best_score, gained_score FROM weekly_scores WHERE player_id = ? AND week = ?")
    .bind(player.id, weekKey(now)).first<{ best_score: number; gained_score: number }>();
  if (weekly && Number(body?.score) - weekly.best_score > Math.max(0, 5000 - weekly.gained_score)) {
    await flag(env, player.id, "weekly_score", "Weekly score cap exceeded.", version);
    return json({ ok: true });
  }
  const decision = scoreDecision(body, previous, now);
  if (!decision.ok) {
    if (decision.suspicious) await flag(env, player.id, "score", decision.reason, version);
    return json({ ok: true });
  }
  const consumed = await env.DB.batch([
    env.DB.prepare("UPDATE replays SET used_at = ? WHERE session_id = ? AND player_id = ? AND used_at IS NULL").bind(now, replaySessionId, player.id),
    env.DB.prepare("UPDATE replay_sessions SET used_at = ? WHERE session_id = ? AND player_id = ? AND used_at IS NULL").bind(now, replaySessionId, player.id),
  ]);
  if (consumed.some((result) => result.meta.changes !== 1)) {
    await flag(env, player.id, "score_replay_race", "Replay session was already consumed.", version);
    return json({ ok: true });
  }
  await env.DB.prepare("INSERT OR REPLACE INTO score_submissions (key, updated_at) VALUES (?, ?)").bind(`ip:${ip}`, now).run();
  await env.DB.prepare("INSERT OR REPLACE INTO score_submissions (key, updated_at) VALUES (?, ?)").bind(`player:${player.id}`, now).run();
  await env.DB.prepare(
    `INSERT INTO scores (player_id, best_score, best_streak, throws, goals, updated_at, version)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(player_id) DO UPDATE SET
       best_score = MAX(scores.best_score, excluded.best_score),
       best_streak = MAX(scores.best_streak, excluded.best_streak),
       throws = MAX(scores.throws, excluded.throws),
       goals = MAX(scores.goals, excluded.goals),
       updated_at = excluded.updated_at, version = excluded.version`,
  ).bind(player.id, decision.score, decision.bestStreak, decision.throws, decision.goals, now, version).run();
  await env.DB.prepare(
    `INSERT INTO weekly_scores (player_id, week, best_score, gained_score) VALUES (?, ?, ?, ?)
     ON CONFLICT(player_id, week) DO UPDATE SET best_score = MAX(weekly_scores.best_score, excluded.best_score), gained_score = MIN(weekly_scores.gained_score + MAX(0, excluded.best_score - weekly_scores.best_score), 5000)`,
  ).bind(player.id, weekKey(now), decision.score, decision.score).run();
  return json({ ok: true, verified: true });
}

async function replay(request: Request, env: Env): Promise<Response> {
  const player = await requirePlayer(request, env);
  const now = Date.now();
  const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM replays WHERE player_id = ? AND created_at > ?").bind(player.id, now - 86_400_000).first<{ n: number }>();
  if ((recent?.n || 0) >= 100) return bad("Too many replays today.", 429);
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_REPLAY_BYTES) return bad("Replay is too large.", 413);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (versionAtLeast(typeof body?.version === "string" ? body.version : "", "0.1.24") && Array.isArray(body?.shots) && body.shots.some((shot) => shot && typeof shot === "object" && hasClientGeometry(shot))) {
    await flag(env, player.id, "replay_geometry", "This client version must use server-owned replay geometry.", typeof body?.version === "string" ? body.version : "");
    return bad("Please update the game before submitting this replay.", 422);
  }
  const decision = verifyReplay(body);
  if (!decision.ok) {
    await flag(env, player.id, "replay", decision.reason, typeof body?.version === "string" ? body.version : "");
    return bad("Replay rejected.", 422);
  }
  const sessionId = body?.sessionId as string;
  const session = await env.DB.prepare("SELECT player_id, seed, created_at, used_at FROM replay_sessions WHERE session_id = ?").bind(sessionId).first<{ player_id: string; seed: string; created_at: number; used_at: number | null }>();
  if (!session || session.player_id !== player.id || session.used_at || now - session.created_at > 30 * 60_000 || body?.seed !== session.seed) {
    await flag(env, player.id, "replay_session", "Replay did not use a valid server session.", typeof body?.version === "string" ? body.version : "");
    return bad("Replay session expired.", 422);
  }
  const data = JSON.stringify(body);
  if (data.length > MAX_REPLAY_BYTES) return bad("Replay is too large.", 413);
  await env.DB.prepare(
    `INSERT OR IGNORE INTO replays (session_id, player_id, created_at, client_version, shots, goals, data) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(sessionId, player.id, now, typeof body?.version === "string" ? body.version.slice(0, 20) : null, decision.shots, decision.goals, data).run();
  return json({ ok: true, verified: true, shots: decision.shots, goals: decision.goals });
}

async function replaySession(request: Request, env: Env): Promise<Response> {
  const player = await requirePlayer(request, env);
  const now = Date.now();
  // Keep abandoned verification payloads from accumulating indefinitely.
  await env.DB.batch([
    env.DB.prepare("DELETE FROM replays WHERE created_at < ?").bind(now - 7 * 86_400_000),
    env.DB.prepare("DELETE FROM replay_sessions WHERE created_at < ?").bind(now - 7 * 86_400_000),
  ]);
  const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM replay_sessions WHERE player_id = ? AND created_at > ?").bind(player.id, now - 86_400_000).first<{ n: number }>();
  if ((recent?.n || 0) >= 100) return bad("Too many replay sessions today.", 429);
  const sessionId = crypto.randomUUID();
  const seed = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO replay_sessions (session_id, player_id, seed, created_at) VALUES (?, ?, ?, ?)")
    .bind(sessionId, player.id, seed, now).run();
  return json({ sessionId, seed, expiresAt: now + 30 * 60_000 });
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
  return json({ id: player.id, nickname, color: player.color ?? null });
}

/** Which of the seven ball colours is yours (0 to 6): shown next to your name on the board. */
async function setColor(request: Request, env: Env): Promise<Response> {
  const player = await requirePlayer(request, env);
  const body = (await request.json().catch(() => ({}))) as { color?: number };
  const color = Number(body.color);
  if (!Number.isInteger(color) || color < 0 || color > 6) return bad("Pick one of the colours.");
  await env.DB.prepare("UPDATE players SET color = ? WHERE id = ?").bind(color, player.id).run();
  return json({ id: player.id, nickname: player.nickname, color });
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

type Player = { id: string; nickname: string; color?: number | null };

async function optionalPlayer(request: Request, env: Env, tokenOverride?: string): Promise<Player | null> {
  const token = tokenOverride || bearer(request);
  if (!token) return null;
  const claims = await verifyJwt<{ playerId: string; exp: number }>(env, token);
  if (!claims || claims.exp < Math.floor(Date.now() / 1000)) return null;
  return env.DB.prepare("SELECT id, nickname, color FROM players WHERE id = ?").bind(claims.playerId).first<Player>();
}

async function requirePlayer(request: Request, env: Env, tokenOverride?: string): Promise<Player> {
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

function iconFor(id: string, color?: number | null): number {
  if (typeof color === "number" && color >= 0 && color <= 6) return color;
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
  matchSeq: number;
  matchEvent: "none" | "shot" | "result" | "rest";
  activeShot?: Record<string, unknown>;
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
  turnPlayerId?: string;
  scores: Map<string, number>;
  letters: Map<string, number>;
  over?: boolean;
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
    const code = this.makeRoom(player.id);
    return json({ code, expiresIn: Math.round(MP_ROOM_TTL_MS / 1000) });
  }

  /** Makes an empty room for a host and returns its code. */
  private makeRoom(hostId: string, game: MpGame = "speed"): string {
    const code = this.newCode();
    const now = Date.now();
    const room: MpRoom = {
      id: crypto.randomUUID(),
      code,
      mode: "friend",
      game,
      court: "Street",
      hostId,
      players: new Map(),
      createdAt: now,
      expiresAt: now + MP_ROOM_TTL_MS,
      scores: new Map(),
      letters: new Map(),
    };
    this.rooms.set(room.id, room);
    this.codeToRoom.set(code, room.id);
    return code;
  }

  private connect(request: Request, url: URL): Response {
    const player = { id: request.headers.get("x-player-id") || "", nickname: request.headers.get("x-player-nickname") || "" };
    if (!player.id || !player.nickname) return bad("Sign in before playing online.", 401);
    const mode = url.searchParams.get("mode") || "";
    if (url.searchParams.get("protocol") !== MP_PROTOCOL) return bad("This multiplayer client is out of date. Update Hoops.", 426);
    const game = (url.searchParams.get("game") || "speed") as MpGame;
    let code = normalizeRoomCode(url.searchParams.get("code") || "");
    if (mode !== "quick" && mode !== "room") return bad("Unsupported multiplayer mode.");
    if (!MP_GAMES.has(game)) return bad("Unknown game.");
    this.sweep();
    // create=1: make the room right here, so there is no gap between making it and joining it
    if (mode === "room" && url.searchParams.get("create") === "1") code = this.makeRoom(player.id, game);

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    // The normal WebSocket API, not the hibernating one: the rooms live in this object's memory, and a hibernating object forgets them while players wait.
    (server as unknown as { accept(): void }).accept();
    server.addEventListener("message", (e: MessageEvent) => void this.webSocketMessage(server, e.data as string | ArrayBuffer));
    server.addEventListener("close", () => void this.webSocketClose(server));
    server.addEventListener("error", () => void this.webSocketError(server));

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
        if (room.startsAt) return sendError(ws, msg, "already_started", "The match is about to start.");
        const game = String(payload.game || "");
        if (!MP_GAMES.has(game)) return sendError(ws, msg, "bad_game", "Unknown game.");
        room.game = game as MpGame;
        // a change takes back everyone's "ready", so nobody starts a match with other rules than they agreed to
        for (const p of room.players.values()) p.ready = false;
        broadcastLobby(room);
        break;
      }
      case "set_court": {
        if (player.id !== room.hostId) return sendError(ws, msg, "not_host", "Only the room host can change this setting.");
        if (room.startsAt) return sendError(ws, msg, "already_started", "The match is about to start.");
        const court = String(payload.court || "");
        if (!MP_COURTS.has(court)) return sendError(ws, msg, "bad_court", "Unknown court.");
        room.court = court as MpCourt;
        for (const p of room.players.values()) p.ready = false;
        broadcastLobby(room);
        break;
      }
      case "ready": {
        // once the countdown has started nobody can change their mind, and the start is sent only once
        if (room.startsAt) return;
        player.ready = payload.ready === true;
        broadcastLobby(room);
        if (room.players.size === 2 && [...room.players.values()].every((p) => p.ready && p.connected)) {
          room.startsAt = Date.now() + 3000;
          room.seed = room.seed || crypto.randomUUID();
          room.turnPlayerId = room.game === "speed" ? undefined : [...room.players.keys()][0];
          room.scores = new Map([...room.players.keys()].map((id) => [id, 0]));
          room.letters = new Map([...room.players.keys()].map((id) => [id, 0]));
          room.over = false;
          broadcast(room, "start_countdown", { startsAt: room.startsAt, seed: room.seed, countdownSeconds: 3, game: room.game, court: room.court });
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
      case "match_event": {
        if (room.over || !room.startsAt || Date.now() < room.startsAt) return sendError(ws, msg, "not_started", "The match has not started yet.");
        const event = payload.event;
        const seq = Number(payload.seq);
        if (!event || typeof event !== "object" || !Number.isInteger(seq) || seq <= player.matchSeq || seq > player.matchSeq + 1) return sendError(ws, msg, "bad_match_event", "Match event was out of order.");
        const kind = String((event as Record<string, unknown>).type || "");
        if (kind !== "shot" && kind !== "result" && kind !== "rest") return sendError(ws, msg, "bad_match_event", "Match event was invalid.");
        const previous = player.matchEvent;
        const allowed = room.game === "speed"
          ? (kind === "shot" ? previous === "none" : kind === "result" ? previous === "shot" : false)
          : (kind === "shot" ? (previous === "none" || previous === "rest") : kind === "result" ? previous === "shot" : previous === "result");
        if (!allowed) return sendError(ws, msg, "bad_match_event", "Match event was not valid for the current turn.");
        if (kind === "shot") {
          if (room.game !== "speed" && room.turnPlayerId !== player.id) return sendError(ws, msg, "wrong_turn", "It is not your turn.");
          if (!Number.isInteger((event as Record<string, unknown>).shotId) || Number((event as Record<string, unknown>).shotId) < 0) return sendError(ws, msg, "bad_match_event", "Shot id was invalid.");
          const numeric = ["x", "y", "vx", "vy", "width", "height", "floorY", "gs", "hoopX", "hoopY", "hoopL", "hoopR", "boardL", "boardR", "boardT", "boardB"];
          if (!numeric.every((key) => typeof (event as Record<string, unknown>)[key] === "number" && Number.isFinite((event as Record<string, unknown>)[key]))) return sendError(ws, msg, "bad_match_event", "Shot physics were invalid.");
          player.activeShot = event as Record<string, unknown>;
        }
        if (kind === "result") {
          const resultT = (event as Record<string, unknown>).resultT;
          if (typeof resultT !== "number" || !Number.isFinite(resultT) || !player.activeShot) return sendError(ws, msg, "bad_match_event", "Match result was invalid.");
          if (!Number.isInteger((event as Record<string, unknown>).shotId) || Number((event as Record<string, unknown>).shotId) < 0) return sendError(ws, msg, "bad_match_event", "Match result shot id was invalid.");
          if ((event as Record<string, unknown>).shotId !== player.activeShot.shotId) return sendError(ws, msg, "bad_match_event", "Match result did not match the active shot.");
          const expectedGoal = simulateReplayShot({ ...player.activeShot, t: 0, resultT, goal: false }).crossed;
          if ((event as Record<string, unknown>).goal !== expectedGoal) return sendError(ws, msg, "bad_match_event", "Server rejected the reported result.");
          const goal = expectedGoal;
          if (room.game === "speed" && goal) room.scores.set(player.id, (room.scores.get(player.id) || 0) + 1);
          if (room.game === "t21" && goal) room.scores.set(player.id, (room.scores.get(player.id) || 0) + ((event as Record<string, unknown>).far === true ? 2 : 1));
          if (room.game === "horse" && !goal) room.letters.set(player.id, (room.letters.get(player.id) || 0) + 1);
          (event as Record<string, unknown>).score = room.scores.get(player.id) || 0;
          (event as Record<string, unknown>).letters = room.letters.get(player.id) || 0;
          const finished = room.game === "speed" ? (room.scores.get(player.id) || 0) >= 10 : room.game === "t21" ? (room.scores.get(player.id) || 0) >= 21 : (room.letters.get(player.id) || 0) >= 5;
          if (finished) room.over = true;
          player.activeShot = undefined;
        }
        if (kind === "result" && (typeof (event as Record<string, unknown>).goal !== "boolean" || typeof (event as Record<string, unknown>).far !== "boolean")) return sendError(ws, msg, "bad_match_event", "Match result was invalid.");
        if (kind === "rest" && (typeof (event as Record<string, unknown>).nx !== "number" || Number((event as Record<string, unknown>).nx) < 0 || Number((event as Record<string, unknown>).nx) > 1)) return sendError(ws, msg, "bad_match_event", "Rest position was invalid.");
        if (kind === "rest" && room.game !== "speed") {
          const peer = peerOf(room, player.id);
          if (!peer) return sendError(ws, msg, "bad_match_event", "The opponent is missing.");
          room.turnPlayerId = peer.id;
        }
        player.matchSeq = seq;
        player.matchEvent = room.game === "speed" && kind === "result" ? "none" : kind as "shot" | "result" | "rest";
        const peer = peerOf(room, player.id);
        if (peer?.socket && peer.connected) send(peer.socket, "match_event", { seq, event });
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
      room.players.set(player.id, { id: player.id, nickname: player.nickname, ready: false, connected: true, role: "answerer", socket, matchSeq: -1, matchEvent: "none" });
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
      players: new Map([[player.id, { id: player.id, nickname: player.nickname, ready: false, connected: true, role: "offerer", socket, matchSeq: -1, matchEvent: "none" }]]),
      createdAt: now,
      expiresAt: now + MP_ROOM_TTL_MS,
      scores: new Map(),
      letters: new Map(),
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
    room.players.set(player.id, { id: player.id, nickname: player.nickname, ready: false, connected: true, role, socket, matchSeq: -1, matchEvent: "none" });
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
      // a room that nobody has joined yet is not "gone": an empty list would count as all gone
      const allGone = room.players.size > 0 && [...room.players.values()].every((p) => !p.connected && (!p.reconnectUntil || p.reconnectUntil < now));
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
  const create = url.searchParams.get("create") === "1";
  if (mode === "room" && !create && !/^[A-Z0-9]{3}-?[A-Z0-9]{3}$/.test(code)) return bad("Room not found. Check the code and try again.", 404);
  const hub = env.MP.get(env.MP.idFromName("v1"));
  const next = new URL("https://mp.local/ws");
  next.searchParams.set("mode", mode);
  next.searchParams.set("game", game);
  if (code) next.searchParams.set("code", code);
  if (create) next.searchParams.set("create", "1");
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
  const body = (await request.json().catch(() => ({}))) as { key?: string; email?: string };
  const key = String(body.key || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  if (!key) return bad("Enter your license key.");
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return bad("Enter the email address used for the purchase.");
  const r = await lemon("activate", { license_key: key, instance_name: "Hoops in the browser" });
  if (r.activated !== true) return bad(String(r.error || "That license key was not accepted."), 400);
  const match = licenseMatch(r.meta);
  if (!match) return bad("That license key is for a different product.");
  const customerEmail = String(r.meta?.customer_email || "").trim().toLowerCase();
  if (!customerEmail || customerEmail !== email) return bad("That license key belongs to a different email address.");
  return json({ instance_id: String(r.instance?.id || ""), unlock: match.unlock, theme_id: match.theme });
}

/** Counts how often each Support Hoops format is shown and clicked (no personal data: just two counters per format per day). */
async function donateEvent(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as { variant?: string; kind?: string };
  const variant = body.variant === "footer" ? "footer" : body.variant === "button" ? "button" : "";
  const kind = body.kind === "view" ? "views" : body.kind === "click" ? "clicks" : "";
  if (!variant || !kind) return bad("Unknown event.");
  const day = new Date().toISOString().slice(0, 10);
  await env.DB.prepare(`INSERT INTO donate_events (variant, day, ${kind}) VALUES (?, ?, 1) ON CONFLICT(variant, day) DO UPDATE SET ${kind} = ${kind} + 1`).bind(variant, day).run();
  return json({ ok: true });
}

const BUG_CATEGORIES = ["Gameplay", "Online", "Looks", "Sound", "Other"];

/** A bug report from the app: kept in the database, at most 5 an hour from one address. */
async function bugReport(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as { category?: string; message?: string; version?: string; system?: string; nickname?: string };
  const message = String(body.message || "").trim();
  const category = BUG_CATEGORIES.includes(String(body.category)) ? String(body.category) : "Other";
  if (message.length < 5) return bad("Write a few words about what happened.");
  if (message.length > 2000) return bad("That is a bit long. Keep it under 2000 characters.");
  const now = Date.now();
  const ipHash = await sha256(`bug:${request.headers.get("cf-connecting-ip") || "?"}:${env.HASH_PEPPER}`);
  const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM bug_reports WHERE ip_hash = ? AND created_at > ?").bind(ipHash, now - 3600_000).first<{ n: number }>();
  if ((recent?.n ?? 0) >= 5) return bad("You have sent a lot of reports. Try again in a while.", 429);
  await env.DB.prepare("INSERT INTO bug_reports (created_at, category, message, version, system, nickname, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(now, category, message, body.version ? String(body.version).slice(0, 20) : null, body.system ? String(body.system).slice(0, 120) : null, body.nickname ? String(body.nickname).slice(0, 40) : null, ipHash)
    .run();
  return json({ ok: true });
}

async function licenseValidate(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as { key?: string };
  const key = String(body.key || "").trim();
  if (!key) return json({ valid: false });
  const r = await lemon("validate", { license_key: key });
  return json({ valid: r.valid === true && licenseMatch(r.meta) !== null });
}
