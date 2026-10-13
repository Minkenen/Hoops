export interface ReplayShot { id: number; t: number; x: number; y: number; vx: number; vy: number; goal: boolean; }
export interface ReplayPayload { sessionId: string; version: string; goals: number; shots: ReplayShot[]; }
const sessionId = crypto.randomUUID();
const startedAt = performance.now();
const shots: ReplayShot[] = [];
export function replayShot(x: number, y: number, vx: number, vy: number): void { if (shots.length < 200) shots.push({ id: shots.length, t: Math.round(performance.now() - startedAt), x, y, vx, vy, goal: false }); }
export function replayResult(goal: boolean): void { const shot = shots[shots.length - 1]; if (shot) shot.goal = goal; }
export function replayPayload(version: string): ReplayPayload | null { return shots.length ? { sessionId, version, goals: shots.filter((shot) => shot.goal).length, shots: shots.map((shot) => ({ ...shot })) } : null; }
