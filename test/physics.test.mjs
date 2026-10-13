import test from "node:test";
import assert from "node:assert/strict";
import { collideCircle, collidePolygon, floorCollision, hoopCrossing, stepBall } from "../src/physics.ts";
import { netBallForce } from "../src/net.ts";

const run = (steps) => {
  const ball = { x: 10, y: 40, vx: 2, vy: -3, t: 0, gs: 1, ang: 0 };
  for (let i = 0; i < steps; i++) stepBall(ball, { dt: 1 / 60, radius: 4 });
  return ball;
};

test("free-flight is deterministic", () => assert.deepEqual(run(120), run(120)));

test("circle collision reflects incoming velocity", () => {
  const ball = { x: 4.5, y: 0, vx: -2, vy: 0, t: 0, gs: 1, ang: 0 };
  const hit = collideCircle(ball, 0, 0, 5, 0.5);
  assert.equal(hit.hit, true);
  assert.ok(ball.vx > 0);
});

test("polygon collision resolves an overlap", () => {
  const ball = { x: 1, y: 5, vx: 2, vy: 0, t: 0, gs: 1, ang: 0 };
  const hit = collidePolygon(ball, [[0, 0], [10, 0], [10, 10], [0, 10]], 0, 0, 2, 0.5);
  assert.equal(hit.hit, true);
  assert.ok(ball.x <= 0 || ball.x >= 10 || ball.y <= 0 || ball.y >= 10);
});

test("floor and hoop crossing use stable edge rules", () => {
  const ball = { x: 5, y: 12, vx: 0, vy: 2, t: 0, gs: 1, ang: 0 };
  assert.equal(floorCollision(ball, 10), true);
  assert.equal(ball.y, 10);
  const shot = { x: 5, y: 12, vx: 0, vy: 1, t: 0, gs: 1, ang: 0 };
  assert.deepEqual(hoopCrossing(8, shot, 10, 0, 10, 1), { scored: true, blocked: false });
});

test("net force is equal and opposite", () => {
  const force = netBallForce(
    { x: 0, y: 0, vx: 0, vy: 0, offsetX: 0, offsetY: 0 },
    { x: 1, y: 0, vx: 2, vy: 0, r: 2 },
  );
  assert.equal(force.nodeX, -force.ballX);
  assert.equal(force.nodeY, -force.ballY);
});
