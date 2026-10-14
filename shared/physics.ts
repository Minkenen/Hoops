export const G = 0.16;
export const geff = (gs: number, tf: number): number => G * (gs + (1 - gs) * Math.max(0, Math.min(1, tf / 40)));

/** The simulation state shared by the visual client and, later, replay verification. */
export interface BallPhysicsState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  gs: number;
  ang: number;
}

export interface PhysicsStepOptions {
  dt: number;
  radius: number;
  gravityScale?: number;
}

export interface CollisionResult {
  hit: boolean;
  impactSpeed: number;
  normalX: number;
  normalY: number;
  previousVx: number;
}

export interface HoopCrossing {
  scored: boolean;
  blocked: boolean;
}

export interface NetNodeState { x: number; y: number; vx: number; vy: number; offsetX: number; offsetY: number; }
export interface NetBallState { x: number; y: number; vx: number; vy: number; r: number; }

/** Shared deterministic ball/net interaction. Rendering and net-node integration stay outside this core. */
export function netBallForce(node: NetNodeState, ball: NetBallState): { nodeX: number; nodeY: number; ballX: number; ballY: number } {
  const dx = node.x + node.offsetX - ball.x;
  const dy = node.y + node.offsetY - ball.y;
  const dist = Math.hypot(dx, dy);
  const min = ball.r + 0.6;
  if (dist <= 0.001 || dist >= min) return { nodeX: 0, nodeY: 0, ballX: 0, ballY: 0 };
  const nx = dx / dist;
  const ny = dy / dist;
  const spring = 0.5 * (min - dist);
  const relativeX = ball.vx - node.vx;
  const relativeY = ball.vy - node.vy;
  const nodeX = spring * nx + 0.12 * relativeX;
  const nodeY = spring * ny + 0.12 * relativeY;
  return { nodeX, nodeY, ballX: -nodeX, ballY: -nodeY };
}

/** Advances only deterministic free-flight motion. Collision handling stays at the caller for now. */
export function stepBall(state: BallPhysicsState, options: PhysicsStepOptions): void {
  const dt = Math.max(0, options.dt);
  const radius = Math.max(0.001, options.radius);
  const gravityScale = options.gravityScale ?? 1;
  state.t += dt;
  state.vy += geff(state.gs, state.t) * gravityScale * dt;
  state.x += state.vx * dt;
  state.y += state.vy * dt;
  state.ang += (state.vx * dt) / radius;
}

export function collideCircle(state: BallPhysicsState, cx: number, cy: number, radius: number, restitution: number): CollisionResult {
  const dx = state.x - cx;
  const dy = state.y - cy;
  const distance = Math.hypot(dx, dy);
  const minDistance = radius;
  if (distance >= minDistance || distance === 0) return { hit: false, impactSpeed: 0, normalX: 0, normalY: 0, previousVx: state.vx };
  const nx = dx / distance;
  const ny = dy / distance;
  state.x = cx + nx * minDistance;
  state.y = cy + ny * minDistance;
  const vn = state.vx * nx + state.vy * ny;
  const previousVx = state.vx;
  if (vn < 0) {
    state.vx -= (1 + restitution) * vn * nx;
    state.vy -= (1 + restitution) * vn * ny;
  }
  return { hit: vn < 0, impactSpeed: Math.max(0, -vn), normalX: nx, normalY: ny, previousVx };
}

export function collidePolygon(state: BallPhysicsState, hull: [number, number][], ox: number, oy: number, radius: number, restitution: number): CollisionResult {
  const n = hull.length;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const ax = hull[i][0] + ox;
    const ay = hull[i][1] + oy;
    const bx = hull[j][0] + ox;
    const by = hull[j][1] + oy;
    if (ay > state.y !== by > state.y && state.x < ((bx - ax) * (state.y - ay)) / (by - ay) + ax) inside = !inside;
  }
  let best = Infinity;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i++) {
    const ax = hull[i][0] + ox;
    const ay = hull[i][1] + oy;
    const bx = hull[(i + 1) % n][0] + ox;
    const by = hull[(i + 1) % n][1] + oy;
    const ex = bx - ax;
    const ey = by - ay;
    const len2 = ex * ex + ey * ey || 1;
    const t = Math.max(0, Math.min(1, ((state.x - ax) * ex + (state.y - ay) * ey) / len2));
    const px = ax + ex * t;
    const py = ay + ey * t;
    const distance = Math.hypot(state.x - px, state.y - py);
    if (distance < best) {
      best = distance;
      cx = px;
      cy = py;
    }
  }
  if (!inside && best >= radius) return { hit: false, impactSpeed: 0, normalX: 0, normalY: 0, previousVx: state.vx };
  let dx = state.x - cx;
  let dy = state.y - cy;
  let distance = Math.hypot(dx, dy);
  if (distance < 1e-6) { dx = 0; dy = -1; distance = 1; }
  let nx = dx / distance;
  let ny = dy / distance;
  if (inside) { nx = -nx; ny = -ny; }
  state.x = cx + nx * radius;
  state.y = cy + ny * radius;
  const vn = state.vx * nx + state.vy * ny;
  const previousVx = state.vx;
  if (vn < 0) {
    state.vx -= (1 + restitution) * vn * nx;
    state.vy -= (1 + restitution) * vn * ny;
  }
  return { hit: vn < 0, impactSpeed: Math.max(0, -vn), normalX: nx, normalY: ny, previousVx };
}

/** Detects a downward crossing of a hoop plane. Rendering and score rules remain outside the physics core. */
export function hoopCrossing(previousY: number, state: BallPhysicsState, rimY: number, left: number, right: number, margin = 0): HoopCrossing {
  const inWindow = state.x > left + margin && state.x < right - margin;
  const blocked = previousY > rimY && state.y <= rimY && state.vy < 0 && state.x > left && state.x < right;
  const scored = previousY < rimY && state.y >= rimY && state.vy > 0 && inWindow;
  return { scored, blocked };
}

export function floorCollision(state: BallPhysicsState, floorY: number): boolean {
  if (state.y <= floorY) return false;
  state.y = floorY;
  return true;
}

