// Solo shots, recorded so the server can play them again. The server sends a session (an id and a seed); the hoop of
// shot number N follows from the seed and N, so the server knows where it stood. A shot is stored with only what the
// hand did (where the ball was, how fast it left) and when it ended; the server works out the rest itself.
import { replayHoopTarget } from "../shared/court.ts";

export interface ReplayShot {
  id: number;
  /** Milliseconds since the app started: when the ball left the hand. */
  t: number;
  /** When the shot was decided (goal or miss). */
  resultT: number;
  artW: number;
  artH: number;
  floorY: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  gs: number;
  goal: boolean;
  /** Not counted: the hoop was not the one the seed gave, or something else than physics touched the ball. */
  void: boolean;
}
export interface ReplayPayload {
  sessionId: string;
  seed: string;
  version: string;
  shots: ReplayShot[];
}

let startedAt = performance.now();
const KEEP_KEY = "hoops.replay.keep";
const MAX_SHOTS = 200;
let sessionId = "";
let seed = "";
let shots: ReplayShot[] = [];
let onSession: (() => void) | null = null;
/** The replay is on its way to the server: shots taken meanwhile are not recorded (they would be lost when the session ends). */
let submitting = false;

/** The game rebuilds the hoop for the next shot when a new session starts. */
export function onReplaySession(f: () => void): void {
  onSession = f;
}

/** Where the hoop of the next shot must stand, or null when there is no session (then the hoop is placed at random and nothing is recorded). */
export function currentReplayTarget(artH: number): { side: "left" | "right"; rimHeight: number; index: number } | null {
  if (!seed || submitting || shots.length >= MAX_SHOTS) return null;
  return { ...replayHoopTarget(seed, shots.length, artH), index: shots.length };
}

export function hasReplaySession(): boolean {
  return !!sessionId && !!seed;
}

/** The shots are also kept on this computer until the server has them, so closing the app (or a crash) never loses goals. */
function keep(): void {
  try {
    if (!sessionId || !seed) localStorage.removeItem(KEEP_KEY);
    else localStorage.setItem(KEEP_KEY, JSON.stringify({ sessionId, seed, shots, savedAt: Date.now() }));
  } catch {
    /* storage can be full or off: the shots are still sent from memory */
  }
}

/** Picks up shots from an earlier run that never reached the server (they go with the first upload). */
function restore(): void {
  try {
    const saved = JSON.parse(localStorage.getItem(KEEP_KEY) ?? "null") as { sessionId?: string; seed?: string; shots?: ReplayShot[]; savedAt?: number } | null;
    if (!saved || typeof saved.sessionId !== "string" || typeof saved.seed !== "string" || !Array.isArray(saved.shots)) return;
    // An empty session is only worth taking back while the server still has it (sessions last 6 hours); one with shots is always sent.
    if (!saved.shots.length && (typeof saved.savedAt !== "number" || Date.now() - saved.savedAt > 4 * 3600_000)) return;
    sessionId = saved.sessionId;
    seed = saved.seed;
    shots = saved.shots.slice(0, MAX_SHOTS);
    if (!shots.length) return;
    const last = shots[shots.length - 1];
    if (last.resultT === 0) {
      last.void = true; // it was in the air when the app closed
      last.resultT = last.t + 1;
    }
    // times run on from where the earlier run stopped
    startedAt = performance.now() - (Math.max(last.t, last.resultT) + 5_000);
  } catch {
    /* unreadable: start fresh */
  }
}
restore();

export function setReplaySession(serverSessionId: string, serverSeed: string): void {
  sessionId = serverSessionId;
  seed = serverSeed;
  shots = [];
  keep();
  onSession?.();
}

export function resetReplay(): void {
  sessionId = "";
  seed = "";
  shots = [];
  keep();
}

const PENDING_KEY = "hoops.replay.pending";
/** Shots that have left their session and wait to be delivered (kept on this computer until the server has them). */
let pending: ReplayPayload[] = [];
try {
  const saved = JSON.parse(localStorage.getItem(PENDING_KEY) ?? "[]") as ReplayPayload[];
  if (Array.isArray(saved)) pending = saved.filter((p) => p && typeof p.sessionId === "string" && Array.isArray(p.shots));
} catch {
  /* nothing waiting */
}
function savePending(): void {
  try {
    if (pending.length) localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    /* storage can be full or off */
  }
}
export function pendingReplays(): ReplayPayload[] {
  return pending.slice();
}
export function dropPending(id: string): void {
  pending = pending.filter((p) => p.sessionId !== id);
  savePending();
}

let idleCheck: (() => boolean) | null = null;
/** The game says when no hoop is up: the session is changed then, so the next hoop already comes from the new seed. */
export function setReplayIdleCheck(f: () => boolean): void {
  idleCheck = f;
}
export function replayIdle(): boolean {
  return idleCheck ? idleCheck() : true;
}

/**
 * The shots of now go to the waiting list and recording carries on at once in a new session: there is no gap in which a shot could be recorded
 * against a hoop that does not come from the seed (and so would not count). Returns the shots that were taken out.
 */
export function rotateReplay(newSessionId: string, newSeed: string, version: string): ReplayPayload | null {
  const payload = replayPayload(version);
  if (!payload) return null;
  pending.push(payload);
  if (pending.length > 20) pending.shift();
  savePending();
  sessionId = newSessionId;
  seed = newSeed;
  shots = [];
  keep();
  onSession?.();
  return payload;
}

export function replaySubmitting(on: boolean): void {
  submitting = on;
}

/** The ball leaves the hand. `hoopIndex` is the shot number the hoop on screen was made for (null: not from the seed). Returns the shot's number, or -1 when nothing is recorded. */
export function replayShot(hand: { x: number; y: number; vx: number; vy: number; gs: number }, view: { artW: number; artH: number; floorY: number }, hoopIndex: number | null): number {
  if (!seed || submitting || shots.length >= MAX_SHOTS) return -1;
  const last = shots[shots.length - 1];
  if (last && !last.void && last.resultT === 0) last.void = true; // the shot before was never decided
  const id = shots.length;
  shots.push({ id, t: Math.round(performance.now() - startedAt), resultT: 0, ...view, ...hand, goal: false, void: hoopIndex !== id });
  keep();
  return id;
}

/** The shot was decided. */
export function replayResult(id: number, goal: boolean): void {
  const shot = shots[id];
  if (shot && shot.resultT === 0) {
    shot.goal = goal;
    shot.resultT = Math.max(shot.t + 1, Math.round(performance.now() - startedAt));
    keep();
  }
}

/** Something other than the physics touched the ball (another screen took it, a guard batted it away): the shot is not counted. */
export function replayVoid(id: number): void {
  const shot = shots[id];
  if (shot) {
    shot.void = true;
    if (shot.resultT === 0) shot.resultT = Math.max(shot.t + 1, Math.round(performance.now() - startedAt));
    keep();
  }
}

/** A shot is in the air or about to be decided: wait with sending. */
export function replayBusy(): boolean {
  const last = shots[shots.length - 1];
  return !!last && !last.void && last.resultT === 0;
}

export function replayPayload(version: string): ReplayPayload | null {
  if (!sessionId || !seed || !shots.length || replayBusy()) return null;
  return { sessionId, seed, version, shots: shots.map((shot) => ({ ...shot })) };
}
