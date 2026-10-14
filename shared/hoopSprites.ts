// The game's own hoop sprites, made without a screen: the same code that draws them in the game gives their numbers here.
import { installCanvasStub } from "./canvasStub.ts";
installCanvasStub();
const sprites = await import("../src/sprites.ts");

export const BALL_R: number = sprites.BALL_R;
/** The sprite in use and the small reference sprite that fixes where the ring sits (as in the game). */
export const HOOPS = {
  left: { sp: sprites.makeHoopSprite("left"), ref: sprites.makeHoopSprite("left", sprites.OLD_BOARD) },
  right: { sp: sprites.makeHoopSprite("right"), ref: sprites.makeHoopSprite("right", sprites.OLD_BOARD) },
};
