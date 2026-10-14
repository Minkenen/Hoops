// One step of the ball in the world (hoop, board, pole, floor and walls). The game and the server run exactly this code,
// so a shot that the server checks plays out the way it did on the player's screen.
// What happens around the physics (sounds, score, the net cloth, handing the ball to the next screen) stays with the caller, through hooks.
import { type BallPhysicsState, type CollisionResult, collideCircle, collidePolygon, floorCollision, hoopCrossing, stepBall } from "./physics.ts";

export const BALL_RADIUS = 10.5;
/** The ring is two small circles (front and back of the ring) of this radius. */
export const RING_PART_RADIUS = 1.8;
export const NET_GRAVITY_SCALE = 1.12;

export interface WorldHoop {
  x0: number;
  y0: number;
  rimY: number;
  frontX: number;
  backX: number;
  netLen: number;
  /** The backboard, relative to (x0, y0). */
  hull: [number, number][];
  /** The pole, relative to (x0, y0). */
  poleBox: [number, number][];
  /** False while the hoop is out of the way: the ball passes through it. */
  active: boolean;
}

export interface WorldBall extends BallPhysicsState {
  scored: boolean;
  noScore: boolean;
  /** The ball just came in from the next screen and may be outside the walls for a moment. */
  entering?: boolean;
}

export type WorldHitKind = "board" | "pole" | "rimFront" | "rimBack";

export interface WorldHooks {
  /** The ball touched the board, the pole or the ring. */
  hit?(kind: WorldHitKind, result: CollisionResult): void;
  /** The ball came down through the ring, and the shot had not been decided yet. */
  goal?(): void;
  /** The ball fell past the net without going in. */
  fell?(): void;
  /** Called after the hoop checks and before the floor: the caller adds the push of the net cloth. */
  afterHoop?(): void;
  /** Just before the floor is checked (the ball's height tells if it is in the air). */
  beforeFloor?(floorLine: number): void;
  /** The ball touched the floor (also a soft touch). */
  floorTouch?(): void;
  /** The ball bounced hard on the floor. */
  floorBounce?(impactVy: number): void;
  /** The floor was handled (bounce or rest). */
  floorAfter?(): void;
  /** The ball hit a wall. */
  wall?(impactSpeed: number): void;
}

export interface WorldStepOptions {
  dt: number;
  floorY: number;
  artW: number;
  hoop: WorldHoop | null;
  /** True for a side that has another screen next to it: the ball leaves through it instead of bouncing. The server has none. */
  hasNeighbor?: (side: -1 | 1) => boolean;
  /** Floor bounces so far in this shot. */
  bounces: number;
  hooks?: WorldHooks;
}

export interface WorldStepResult {
  bounces: number;
  /** The ball left through a side that has another screen (-1 left, 1 right), or 0. The step stopped there. */
  exited: -1 | 0 | 1;
}

/** Restitution of the floor: first bounces as before, then they die out faster. */
export function floorRestitution(bounces: number): number {
  return bounces < 2 ? 0.74 : Math.max(0.35, 0.62 - (bounces - 2) * 0.1);
}

export function stepWorld(ball: WorldBall, o: WorldStepOptions): WorldStepResult {
  const hooks = o.hooks ?? {};
  const hp = o.hoop;
  let bounces = o.bounces;
  let inNet = false;
  if (hp) {
    const l0 = hp.x0 + Math.min(hp.frontX, hp.backX);
    const r0 = hp.x0 + Math.max(hp.frontX, hp.backX);
    inNet = ball.x > l0 && ball.x < r0 && ball.y > hp.rimY && ball.y < hp.rimY + hp.netLen + BALL_RADIUS;
  }
  const py = ball.y;
  stepBall(ball, { dt: o.dt, radius: BALL_RADIUS, gravityScale: inNet ? NET_GRAVITY_SCALE : 1 });

  if (hp && hp.active) {
    const fx = hp.x0 + hp.frontX;
    const bx = hp.x0 + hp.backX;
    const touch = (kind: WorldHitKind, r: CollisionResult): void => {
      if (r.hit) hooks.hit?.(kind, r);
    };
    touch("board", collidePolygon(ball, hp.hull, hp.x0, hp.y0, BALL_RADIUS, 0.55));
    touch("pole", collidePolygon(ball, hp.poleBox, hp.x0, hp.y0, BALL_RADIUS, 0.5));
    touch("rimFront", collideCircle(ball, fx, hp.rimY, BALL_RADIUS + RING_PART_RADIUS, 0.5));
    touch("rimBack", collideCircle(ball, bx, hp.rimY, BALL_RADIUS + RING_PART_RADIUS, 0.5));
    const l = Math.min(fx, bx);
    const r = Math.max(fx, bx);
    const crossing = hoopCrossing(py, ball, hp.rimY, l, r, 1);
    if (crossing.blocked) ball.noScore = true;
    if (!ball.scored && !ball.noScore && crossing.scored) {
      hooks.goal?.();
    } else if (!ball.scored && ball.vy > 0 && ball.y > hp.rimY + 30) {
      hooks.fell?.();
    }
  }
  if (hp) hooks.afterHoop?.();

  const fy = o.floorY - BALL_RADIUS;
  hooks.beforeFloor?.(fy);
  if (floorCollision(ball, fy)) {
    hooks.floorTouch?.();
    ball.noScore = false;
    if (ball.vy > 1.2) {
      hooks.floorBounce?.(ball.vy);
      const e = floorRestitution(bounces);
      bounces++;
      ball.vy *= -e;
      ball.vx *= bounces > 2 ? 0.85 : 0.93;
    } else {
      ball.vy = 0;
    }
    hooks.floorAfter?.();
  }

  if (ball.entering) {
    if (ball.x >= BALL_RADIUS && ball.x <= o.artW - BALL_RADIUS) ball.entering = false;
  } else if (ball.x < BALL_RADIUS) {
    if (o.hasNeighbor?.(-1)) {
      if (ball.x < 0) return { bounces, exited: -1 };
    } else {
      ball.x = BALL_RADIUS;
      if (ball.vx < 0) {
        hooks.wall?.(-ball.vx);
        ball.vx *= -0.65;
      }
    }
  } else if (ball.x > o.artW - BALL_RADIUS) {
    if (o.hasNeighbor?.(1)) {
      if (ball.x > o.artW) return { bounces, exited: 1 };
    } else {
      ball.x = o.artW - BALL_RADIUS;
      if (ball.vx > 0) {
        hooks.wall?.(ball.vx);
        ball.vx *= -0.65;
      }
    }
  }
  if (ball.y < -700) {
    ball.y = -700;
    ball.vy = Math.abs(ball.vy);
  }
  return { bounces, exited: 0 };
}
