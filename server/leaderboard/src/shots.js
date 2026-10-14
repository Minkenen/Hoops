// What a shot can be, checked the same way for solo replays and online matches.
// The ball is always shot from where it rests on the floor, with a speed the hand can give it: nothing about the court comes from the player.
import { BALL_R, HOOPS } from "../../../shared/hoopSprites.ts";
import { floorRange, matchHoopTarget, maxSpeed, placeHoop, replayHoopTarget, worldHoop } from "../../../shared/court.ts";

export const SHOT_NUMBERS = ["artW", "artH", "floorY", "x", "y", "vx", "vy", "gs"];
const FLOOR_SLACK = 1.5;

const finite = (v) => typeof v === "number" && Number.isFinite(v);

/** Returns the reason a shot is impossible, or null. */
export function shotProblem(shot) {
  if (!shot || typeof shot !== "object") return "Shot is not an object.";
  if (!SHOT_NUMBERS.every((key) => finite(shot[key]))) return "Shot numbers are invalid.";
  if (shot.artW < 320 || shot.artW > 2000 || shot.artH < 200 || shot.artH > 1400) return "Shot dimensions are invalid.";
  const floor = floorRange(shot.artH);
  if (shot.floorY < floor.min || shot.floorY > floor.max) return "Shot floor is invalid.";
  if (shot.x < BALL_R || shot.x > shot.artW - BALL_R) return "Shot start is outside the court.";
  if (Math.abs(shot.y - (shot.floorY - BALL_R)) > FLOOR_SLACK) return "Shot does not start on the floor.";
  if (shot.gs < 0 || shot.gs > 1) return "Shot gravity is impossible.";
  if (Math.hypot(shot.vx, shot.vy) > maxSpeed(shot.artW) * (1 + 1e-9)) return "Shot speed is impossible.";
  return null;
}

function courtOf(target, artW, artH, floorY) {
  const { sp, ref } = HOOPS[target.side];
  const at = placeHoop(sp, ref, target.side, artW, floorY, target.rimHeight);
  return { side: target.side, hoop: worldHoop(sp, at, artH, true), ringX: at.x0 + sp.rimCx };
}

/** Solo: the court of shot number `index` in a session. */
export function soloCourt(seed, index, shot) {
  return courtOf(replayHoopTarget(seed, index, shot.artH), shot.artW, shot.artH, shot.floorY);
}

/** An online match: the court of round `round` for a seed (turn games share one seed, Speedball gives each player their own). */
export function matchCourt(seedKey, round, shot) {
  return courtOf(matchHoopTarget(seedKey, round, shot.artH), shot.artW, shot.artH, shot.floorY);
}

/** Is the shot from far away (the same rule the game uses for 21's two points)? */
export function isFar(shot, ringX) {
  return Math.abs(shot.x - ringX) > shot.artW * 0.55;
}
