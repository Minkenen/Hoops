import { cleanNickname, defaultNickname, scoreDecision, weekKey } from "./logic.js";

interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}

interface Env {
  DB: D1Database;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  APPLE_CLIENT_ID: string;
  APPLE_CLIENT_SECRET: string;
  SESSION_SECRET: string;
  HASH_PEPPER: string;
}

type Provider = "apple" | "google";

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

const bad = (message: string, status = 400): Response => json({ error: message }, status);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (request.method === "GET" && url.pathname === "/leaderboard") return leaderboard(request, env, url);
      if (request.method === "GET" && url.pathname === "/me") return me(request, env);
      if (request.method === "GET" && url.pathname === "/auth/start") return authStart(env, url);
      if (request.method === "GET" && url.pathname === "/auth/callback") return authCallback(env, url);
      if (request.method === "POST" && url.pathname === "/score") return score(request, env);
      if (request.method === "POST" && url.pathname === "/nickname") return nickname(request, env);
      if (request.method === "DELETE" && url.pathname === "/account") return deleteAccount(request, env);
      return bad("Not found.", 404);
    } catch (error) {
      return bad(error instanceof Error ? error.message : "Server error.", 500);
    }
  },
};

async function authStart(env: Env, url: URL): Promise<Response> {
  const provider = url.searchParams.get("provider") as Provider | null;
  const redirectUri = url.searchParams.get("redirect_uri") || "";
  if (provider !== "apple" && provider !== "google") return bad("Unsupported provider.");
  if (!redirectUri.startsWith("http://127.0.0.1:")) return bad("Unsupported redirect.");
  const state = await signJwt(env, { provider, redirectUri, exp: Math.floor(Date.now() / 1000) + 600 });
  if (provider === "google") {
    const next = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    next.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
    next.searchParams.set("redirect_uri", `${url.origin}/auth/callback`);
    next.searchParams.set("response_type", "code");
    next.searchParams.set("scope", "openid");
    next.searchParams.set("state", state);
    return Response.redirect(next.toString(), 302);
  }
  const next = new URL("https://appleid.apple.com/auth/authorize");
  next.searchParams.set("client_id", env.APPLE_CLIENT_ID);
  next.searchParams.set("redirect_uri", `${url.origin}/auth/callback`);
  next.searchParams.set("response_type", "code");
  next.searchParams.set("scope", "openid");
  next.searchParams.set("response_mode", "query");
  next.searchParams.set("state", state);
  return Response.redirect(next.toString(), 302);
}

async function authCallback(env: Env, url: URL): Promise<Response> {
  const code = url.searchParams.get("code") || "";
  const state = await verifyJwt<{ provider: Provider; redirectUri: string; exp: number }>(env, url.searchParams.get("state") || "");
  if (!code || !state || state.exp < Math.floor(Date.now() / 1000)) return bad("Sign-in expired.");
  const sub = state.provider === "google" ? await googleSub(env, url.origin, code) : await appleSub(env, url.origin, code);
  const player = await upsertPlayer(env, state.provider, sub);
  const token = await signJwt(env, { playerId: player.id, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 90 });
  const redirect = new URL(state.redirectUri);
  redirect.searchParams.set("token", token);
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

async function appleSub(env: Env, origin: string, code: string): Promise<string> {
  const body = new URLSearchParams({
    code,
    client_id: env.APPLE_CLIENT_ID,
    client_secret: env.APPLE_CLIENT_SECRET,
    redirect_uri: `${origin}/auth/callback`,
    grant_type: "authorization_code",
  });
  const token = await fetch("https://appleid.apple.com/auth/token", { method: "POST", body });
  const data = await token.json() as { id_token?: string };
  const claims = decodeJwt(data.id_token || "");
  if (!claims.sub) throw new Error("Apple sign-in failed.");
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
  const nickname = cleanNickname(body.nickname);
  if (!nickname) return bad("Choose another nickname.");
  await env.DB.prepare("UPDATE players SET nickname = ? WHERE id = ?").bind(nickname, player.id).run();
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
  const id = crypto.randomUUID();
  const nickname = defaultNickname(providerHash);
  await env.DB.prepare("INSERT INTO players (id, provider, provider_user_id_hash, nickname, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(id, provider, providerHash, nickname, Date.now())
    .run();
  return { id, nickname };
}

async function optionalPlayer(request: Request, env: Env): Promise<{ id: string; nickname: string } | null> {
  const token = bearer(request);
  if (!token) return null;
  const claims = await verifyJwt<{ playerId: string; exp: number }>(env, token);
  if (!claims || claims.exp < Math.floor(Date.now() / 1000)) return null;
  return env.DB.prepare("SELECT id, nickname FROM players WHERE id = ?").bind(claims.playerId).first<{ id: string; nickname: string }>();
}

async function requirePlayer(request: Request, env: Env): Promise<{ id: string; nickname: string }> {
  const player = await optionalPlayer(request, env);
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
