// The real worker, called the way the app calls it, on a database that runs the real SQL.
import { fakeD1 } from "./fakeD1.mjs";

const b64 = (bytes) => Buffer.from(bytes).toString("base64url");

export async function loadWorker() {
  return (await import("../../server/leaderboard/src/index.ts")).default;
}

export async function makeWorld({ now = () => Date.now() } = {}) {
  const worker = await loadWorker();
  const env = { DB: fakeD1(), SESSION_SECRET: "test-secret", HASH_PEPPER: "pepper", GOOGLE_CLIENT_ID: "x", GOOGLE_CLIENT_SECRET: "y", MP: {} };
  const crypto = globalThis.crypto;
  const hmac = async (value) => {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.SESSION_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    return b64(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))));
  };
  const world = {
    env,
    async addPlayer(id, nickname = id) {
      await env.DB.prepare("INSERT INTO players (id, provider, provider_user_id_hash, nickname, nickname_lower, created_at) VALUES (?, 'google', ?, ?, ?, ?)").bind(id, `hash-${id}`, nickname, nickname.toLowerCase(), now()).run();
      const header = b64(Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })));
      const body = b64(Buffer.from(JSON.stringify({ playerId: id, exp: Math.floor(now() / 1000) + 3600 })));
      return `${header}.${body}.${await hmac(`${header}.${body}`)}`;
    },
    async call(method, path, { token, body, ip = "1.2.3.4", raw } = {}) {
      const headers = { "content-type": "application/json", "cf-connecting-ip": ip };
      if (token) headers.authorization = `Bearer ${token}`;
      const res = await worker.fetch(new Request(`https://hoops.test${path}`, { method, headers, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) }), env);
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch { /* not json */ }
      return { status: res.status, json };
    },
    rows: async (sql, ...p) => (await env.DB.prepare(sql).bind(...p).all()).results,
  };
  return world;
}
