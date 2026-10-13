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

