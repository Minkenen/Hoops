import test from "node:test";
import assert from "node:assert/strict";
import { cleanNickname, defaultNickname, nicknameDecision, nicknameLower, versionAtLeast, weekKey } from "../src/logic.js";

test("weekKey starts on Monday UTC", () => {
  assert.equal(weekKey(Date.UTC(2026, 9, 12, 0, 0, 0)), "2026-10-12");
  assert.equal(weekKey(Date.UTC(2026, 9, 18, 23, 59, 0)), "2026-10-12");
});

test("versions are compared by their numbers, not as text", () => {
  assert.equal(versionAtLeast("0.1.24", "0.1.23"), true);
  assert.equal(versionAtLeast("0.1.100", "0.1.23"), true);
  assert.equal(versionAtLeast("0.1.9", "0.1.23"), false);
  assert.equal(versionAtLeast("0.2.0", "0.1.99"), true);
  assert.equal(versionAtLeast("", "0.1.23"), false);
  assert.equal(versionAtLeast("garbage", "0.1.23"), false);
});

test("cleanNickname filters bad or empty names", () => {
  assert.equal(cleanNickname("  Court Kid!! "), "Court Kid");
  assert.equal(cleanNickname("Mi"), null);
  assert.equal(cleanNickname("fuck"), null);
});

test("nicknameLower compares cleaned names case-insensitively", () => {
  assert.equal(nicknameLower("Mia "), "mia");
  assert.equal(nicknameLower(" mia"), "mia");
});

test("nicknameDecision rejects taken names with different capital letters", () => {
  const existing = new Set(["mia"]);
  assert.deepEqual(nicknameDecision("Mia ", existing), { ok: false, status: 409, error: "That name is taken. Try another." });
});

test("nicknameDecision rejects invalid names with the user-facing message", () => {
  assert.deepEqual(nicknameDecision("Mi"), { ok: false, status: 400, error: "Use 3 to 18 letters, numbers, spaces, - or _." });
});

test("defaultNickname can retry with different digits", () => {
  const first = defaultNickname("same-provider-hash", 0);
  const retry = defaultNickname("same-provider-hash", 1);
  assert.match(first, /^HoopsFan\d{4}$/);
  assert.match(retry, /^HoopsFan\d{4}$/);
  assert.notEqual(first, retry);
});
