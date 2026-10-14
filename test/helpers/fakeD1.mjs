// A D1 database for tests: the real SQL runs on SQLite (node:sqlite), through the same calls the worker makes (prepare, bind, first, all, run, batch).
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const param = (v) => (v === undefined ? null : typeof v === "boolean" ? (v ? 1 : 0) : v);

export function fakeD1(schemaPath = new URL("../../server/leaderboard/schema.sql", import.meta.url)) {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(readFileSync(schemaPath, "utf8"));
  const make = (sql, params = []) => ({
    bind: (...p) => make(sql, p.map(param)),
    first: async () => { const r = db.prepare(sql).get(...params); return r ? { ...r } : null; },
    all: async () => ({ results: db.prepare(sql).all(...params).map((r) => ({ ...r })) }),
    run: async () => { const r = db.prepare(sql).run(...params); return { meta: { changes: Number(r.changes) } }; },
    _exec: () => {
      if (/^\s*(select|with)/i.test(sql)) return { results: db.prepare(sql).all(...params), meta: { changes: 0 } };
      const r = db.prepare(sql).run(...params);
      return { meta: { changes: Number(r.changes) } };
    },
  });
  return {
    raw: db,
    prepare: (sql) => make(sql),
    batch: async (statements) => {
      db.exec("BEGIN");
      try {
        const out = statements.map((s) => s._exec());
        db.exec("COMMIT");
        return out;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
}
