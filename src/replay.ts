export interface ReplayShot { id: number; t: number; resultT: number; width: number; height: number; floorY: number; x: number; y: number; vx: number; vy: number; nx: number; ny: number; gs: number; hoopX: number; hoopY: number; hoopL: number; hoopR: number; boardL: number; boardR: number; boardT: number; boardB: number; goal: boolean; }
export interface ReplayPayload { sessionId: string; seed: string; version: string; goals: number; shots: ReplayShot[]; }
let sessionId = "";
let seed = "";
const startedAt = performance.now();
const shots: ReplayShot[] = [];
function hash(value: string): number { let h = 0; for (let i = 0; i < value.length; i++) h = Math.imul(31, h) + value.charCodeAt(i) | 0; return Math.abs(h); }
export function replayHoopTarget(index: number, height: number): { side: "left" | "right"; rimHeight: number } {
  const n = hash(`${seed || sessionId}:${index}`);
  const max = Math.min(260, height * 0.6);
  return { side: n % 2 ? "right" : "left", rimHeight: 70 + (n % 100000) / 100000 * Math.max(10, max - 70) };
}
export function currentReplayShotIndex(): number { return shots.length; }
export function replayShot(x: number, y: number, vx: number, vy: number, width: number, height: number, floorY: number, gs: number, hoopX: number, hoopY: number, hoopL: number, hoopR: number, boardL: number, boardR: number, boardT: number, boardB: number): void {
  if (shots.length < 200) shots.push({ id: shots.length, t: Math.round(performance.now() - startedAt), resultT: 0, width, height, floorY, x, y, vx, vy, nx: x / Math.max(1, width), ny: y / Math.max(1, height), gs, hoopX, hoopY, hoopL, hoopR, boardL, boardR, boardT, boardB, goal: false });
}
export function replayResult(goal: boolean): void { const shot = shots[shots.length - 1]; if (shot) { shot.goal = goal; shot.resultT = Math.round(performance.now() - startedAt); } }
export function replayPayload(version: string): ReplayPayload | null { return shots.length && sessionId && seed ? { sessionId, seed, version, goals: shots.filter((shot) => shot.goal).length, shots: shots.map((shot) => ({ ...shot })) } : null; }
export function resetReplay(): void { shots.length = 0; sessionId = ""; seed = ""; }
export function setReplaySession(serverSessionId: string, serverSeed: string): void { shots.length = 0; sessionId = serverSessionId; seed = serverSeed; }
