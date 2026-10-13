export interface ReplayShot { id: number; t: number; resultT: number; width: number; height: number; x: number; y: number; vx: number; vy: number; nx: number; ny: number; gs: number; hoopX: number; hoopY: number; hoopL: number; hoopR: number; goal: boolean; }
export interface ReplayPayload { sessionId: string; version: string; goals: number; shots: ReplayShot[]; }
const sessionId = crypto.randomUUID();
const startedAt = performance.now();
const shots: ReplayShot[] = [];
export function replayShot(x: number, y: number, vx: number, vy: number, width: number, height: number, gs: number, hoopX: number, hoopY: number, hoopL: number, hoopR: number): void {
  if (shots.length < 200) shots.push({ id: shots.length, t: Math.round(performance.now() - startedAt), resultT: 0, width, height, x, y, vx, vy, nx: x / Math.max(1, width), ny: y / Math.max(1, height), gs, hoopX, hoopY, hoopL, hoopR, goal: false });
}
export function replayResult(goal: boolean): void { const shot = shots[shots.length - 1]; if (shot) { shot.goal = goal; shot.resultT = Math.round(performance.now() - startedAt); } }
export function replayPayload(version: string): ReplayPayload | null { return shots.length ? { sessionId, version, goals: shots.filter((shot) => shot.goal).length, shots: shots.map((shot) => ({ ...shot })) } : null; }
