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

const startedAt = performance.now();
const MAX_SHOTS = 200;
let sessionId = "";
let seed = "";
let shots: ReplayShot[] = [];
let onSession: (() => void) | null = null;

/** The game rebuilds the hoop for the next shot when a new session starts. */
export function onReplaySession(f: () => void): void {
  onSession = f;
}

/** Where the hoop of the next shot must stand, or null when there is no session (then the hoop is placed at random and nothing is recorded). */
export function currentReplayTarget(artH: number): { side: "left" | "right"; rimHeight: number; index: number } | null {
  if (!seed || shots.length >= MAX_SHOTS) return null;
  return { ...replayHoopTarget(seed, shots.length, artH), index: shots.length };
}

export function hasReplaySession(): boolean {
  return !!sessionId && !!seed;
}

export function setReplaySession(serverSessionId: string, serverSeed: string): void {
  sessionId = serverSessionId;
  seed = serverSeed;
  shots = [];
  onSession?.();
}

export function resetReplay(): void {
  sessionId = "";
  seed = "";
  shots = [];
}

/** The ball leaves the hand. `hoopIndex` is the shot number the hoop on screen was made for (null: not from the seed). Returns the shot's number, or -1 when nothing is recorded. */
export function replayShot(hand: { x: number; y: number; vx: number; vy: number; gs: number }, view: { artW: number; artH: number; floorY: number }, hoopIndex: number | null): number {
  if (!seed || shots.length >= MAX_SHOTS) return -1;
  const last = shots[shots.length - 1];
  if (last && !last.void && last.resultT === 0) last.void = true; // the shot before was never decided
  const id = shots.length;
  shots.push({ id, t: Math.round(performance.now() - startedAt), resultT: 0, ...view, ...hand, goal: false, void: hoopIndex !== id });
  return id;
}

/** The shot was decided. */
export function replayResult(id: number, goal: boolean): void {
  const shot = shots[id];
  if (shot && shot.resultT === 0) {
    shot.goal = goal;
    shot.resultT = Math.max(shot.t + 1, Math.round(performance.now() - startedAt));
  }
}

/** Something other than the physics touched the ball (another screen took it, a guard batted it away): the shot is not counted. */
export function replayVoid(id: number): void {
  const shot = shots[id];
  if (shot) {
    shot.void = true;
    if (shot.resultT === 0) shot.resultT = Math.max(shot.t + 1, Math.round(performance.now() - startedAt));
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
