// Where the hoop stands and how fast a shot can be. The game and the server both place the hoop with these functions,
// so the server knows exactly where the hoop was on the player's screen without being told.
import { G } from "./physics.ts";
import type { WorldHoop } from "./world.ts";

export type Side = "left" | "right";

/** The numbers of a hoop sprite that the placement needs (the game's HoopSprite has all of them). */
export interface HoopShape {
  w: number;
  rimY: number;
  rimCx: number;
  frontX: number;
  backX: number;
  netLen: number;
  hull: [number, number][];
  poleTop: [[number, number], [number, number]];
  shiftY: number;
}

export const VMAX = 9;
export const RANGE_FACTOR = 1.35;
/** How far back a pull can go (the aim code's MAXPULL): the floor line never gets closer to the bottom than this plus 8. */
export const MAXPULL = 40;

/** The fastest a shot can leave the hand on a screen this wide (in the game's own units). */
export function maxSpeed(screenArtWidth: number): number {
  return Math.max(VMAX, Math.sqrt(RANGE_FACTOR * G * screenArtWidth));
}

/** The hash both sides use to turn a seed into side and height. */
export function seedHash(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (Math.imul(31, h) + value.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** The tallest a rim can be set above the floor. */
export function maxRimHeight(artH: number): number {
  return Math.min(260, artH * 0.6);
}

export interface HoopTarget {
  side: Side;
  /** How high the rim is above the floor line. */
  rimHeight: number;
}

/** Solo play: the hoop of shot number `index` in a session follows from the server's seed. */
export function replayHoopTarget(seed: string, index: number, artH: number): HoopTarget {
  const n = seedHash(`${seed}:${index}`);
  const max = maxRimHeight(artH);
  return { side: n % 2 ? "right" : "left", rimHeight: 70 + ((n % 100000) / 100000) * Math.max(10, max - 70) };
}

/** An online match with turns: the hoop of round `round` follows from the seed of the room. */
export function matchHoopTarget(seed: string, round: number, artH: number): HoopTarget {
  const max = maxRimHeight(artH);
  return {
    side: seedHash(`${seed}:${round}:side`) % 2 ? "right" : "left",
    rimHeight: 70 + (seedHash(`${seed}:${round}:height`) / 0x7fffffff) * Math.max(10, max - 70),
  };
}

/** How far from a hoop's side of the screen the ball must be, besides the hoop's own width, for a shot to be possible. */
export const HOOP_CLEARANCE = 10.5 + 36;

/**
 * The side the hoop really stands on: the seed's side, unless the ball is too close to that side to shoot (then the hoop comes on the other side).
 * The game and the server use this same rule with the ball's x, so the server knows where the hoop stood.
 * `leftW` and `rightW` are the widths of the two hoops (their reference sprites).
 */
export function hoopSide(seedSide: Side, ballX: number, artW: number, leftW: number, rightW: number): Side {
  const tooCloseRight = ballX >= artW - rightW - HOOP_CLEARANCE;
  const tooCloseLeft = ballX <= leftW + HOOP_CLEARANCE;
  if (seedSide === "right" && tooCloseRight && !tooCloseLeft) return "left";
  if (seedSide === "left" && tooCloseLeft && !tooCloseRight) return "right";
  return seedSide;
}

export interface HoopPlacement {
  x0: number;
  y0: number;
  rimY: number;
}

/** The hoop's place on a screen: `sp` is the sprite in use and `ref` the small reference sprite that fixes where the ring sits. */
export function placeHoop(sp: Pick<HoopShape, "rimY" | "rimCx">, ref: Pick<HoopShape, "w" | "rimCx">, side: Side, artW: number, floorY: number, rimHeight: number): HoopPlacement {
  const rimY = Math.max(floorY - rimHeight, 8 + sp.rimY);
  const x0 = side === "right" ? artW - ref.w + ref.rimCx - sp.rimCx : ref.rimCx - sp.rimCx;
  return { x0, y0: rimY - sp.rimY, rimY };
}

/** The pole behind the hoop, relative to the sprite's corner. */
export function poleBox(sp: Pick<HoopShape, "rimY" | "poleTop">, rimY: number, poleBottom: number): [number, number][] {
  const down = poleBottom - (rimY - sp.rimY) + 2;
  return [sp.poleTop[0], sp.poleTop[1], [sp.poleTop[1][0], down], [sp.poleTop[0][0], down]];
}

export function worldHoop(sp: HoopShape, at: HoopPlacement, poleBottom: number, active = true): WorldHoop {
  return {
    x0: at.x0,
    y0: at.y0,
    rimY: at.rimY,
    frontX: sp.frontX,
    backX: sp.backX,
    netLen: sp.netLen,
    hull: sp.hull,
    poleBox: poleBox(sp, at.rimY, poleBottom),
    active,
  };
}

/** The floor line sits this far from the bottom (the dock height, but never less than the pull room): the server only checks the range. */
export function floorRange(artH: number): { min: number; max: number } {
  return { min: artH - 160, max: artH - (MAXPULL + 8) };
}
