// A frozen copy of the game's ball step as it was before it moved to shared/world.ts (Game.sub in src/game.ts, with sounds, score and the net cloth left out).
// It is the reference the shared step is compared against: a change that makes the shared step play differently fails the test.
import { collideCircle, collidePolygon, floorCollision, hoopCrossing, stepBall } from "../../shared/physics.ts";

const BALL_R = 10.5;

/** `g`: { ball, hoop, floorY, artW, bounces, neighbor(dir), events[] }. `hoop` has sprite {frontX, backX, hull, netLen}, x0, y0, rimY, poleBox and phase. */
export function legacySub(g, dt) {
  const b = g.ball;
  const hp = g.hoop;
  let inNet = false;
  if (hp) {
    const l0 = hp.x0 + Math.min(hp.sprite.frontX, hp.sprite.backX);
    const r0 = hp.x0 + Math.max(hp.sprite.frontX, hp.sprite.backX);
    inNet = b.x > l0 && b.x < r0 && b.y > hp.rimY && b.y < hp.rimY + hp.sprite.netLen + BALL_R;
  }
  const py = b.y;
  stepBall(b, { dt, radius: BALL_R, gravityScale: inNet ? 1.12 : 1 });

  const h = g.hoop;
  if (h && h.phase !== "out") {
    const sp = h.sprite;
    const fx = h.x0 + sp.frontX;
    const bx = h.x0 + sp.backX;
    const hit = (kind, r) => { if (r.hit) g.events.push(["hit", kind]); };
    hit("board", collidePolygon(b, sp.hull, h.x0, h.y0, BALL_R, 0.55));
    hit("pole", collidePolygon(b, h.poleBox, h.x0, h.y0, BALL_R, 0.5));
    hit("rimFront", collideCircle(b, fx, h.rimY, BALL_R + 1.8, 0.5));
    hit("rimBack", collideCircle(b, bx, h.rimY, BALL_R + 1.8, 0.5));
    const l = Math.min(fx, bx);
    const r = Math.max(fx, bx);
    const crossing = hoopCrossing(py, b, h.rimY, l, r, 1);
    if (crossing.blocked) b.noScore = true;
    if (!b.scored && !b.noScore && crossing.scored) {
      b.scored = true;
      b.postGoal = true;
      b.vx *= 0.3;
      g.events.push(["goal"]);
    } else if (!b.scored && b.vy > 0 && b.y > h.rimY + 30) {
      g.events.push(["fell"]);
    }
  }
  const fy = g.floorY - BALL_R;
  if (floorCollision(b, fy)) {
    b.noScore = false;
    if (b.vy > 1.2) {
      g.events.push(["floorBounce"]);
      const e = g.bounces < 2 ? 0.74 : Math.max(0.35, 0.62 - (g.bounces - 2) * 0.1);
      g.bounces++;
      b.vy *= -e;
      b.vx *= g.bounces > 2 ? 0.85 : 0.93;
    } else {
      b.vy = 0;
    }
  }

  if (b.entering) {
    if (b.x >= BALL_R && b.x <= g.artW - BALL_R) b.entering = false;
  } else if (b.x < BALL_R) {
    const n = g.neighbor(-1);
    if (n) {
      if (b.x < 0) { g.events.push(["exit", -1]); return; }
    } else {
      b.x = BALL_R;
      if (b.vx < 0) { b.vx *= -0.65; g.events.push(["wall"]); }
    }
  } else if (b.x > g.artW - BALL_R) {
    const n = g.neighbor(1);
    if (n) {
      if (b.x > g.artW) { g.events.push(["exit", 1]); return; }
    } else {
      b.x = g.artW - BALL_R;
      if (b.vx > 0) { b.vx *= -0.65; g.events.push(["wall"]); }
    }
  }
  if (b.y < -700) {
    b.y = -700;
    b.vy = Math.abs(b.vy);
  }
}
