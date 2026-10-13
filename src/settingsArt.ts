// Small pixel pictures for the settings window: what each choice looks like.
// Canvases in the markup say what to draw with data-art, and drawSettingsArt() fills them after every render.

const rnd = (seed: number): (() => number) => {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
};
const SHIRTS = ["#e8731f", "#3a6fd9", "#f2f4f7", "#8a8e96"];

export type CrowdArt = "off" | "row" | "half" | "full";

function scene(cv: HTMLCanvasElement, crowd: CrowdArt): void {
  const W = cv.width;
  const H = cv.height;
  const c = cv.getContext("2d")!;
  c.imageSmoothingEnabled = false;
  const floor = H - 7;
  const top = crowd === "full" ? 0 : crowd === "half" ? Math.round(H / 2) : crowd === "row" ? floor - 7 : floor;
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#1b1e33");
  g.addColorStop(1, "#2d3150");
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  if (crowd !== "off") {
    c.fillStyle = "#232640";
    c.fillRect(0, top, W, floor - top);
    const rows = Math.max(1, Math.ceil((floor - top) / 7));
    for (let r = rows - 1; r >= 0; r--) {
      const y = floor - (r + 1) * 7;
      c.fillStyle = r % 2 ? "#2a2e52" : "#252849";
      c.fillRect(0, y, W, 7);
      const R = rnd(r * 97 + 11);
      for (let x = 2 + (r % 2) * 2; x < W - 2; x += 5) {
        if (R() < 0.08) continue;
        c.fillStyle = SHIRTS[Math.floor(R() * 4)];
        c.fillRect(x, y + 3, 3, 4);
        c.fillStyle = "#e7b98f";
        c.fillRect(x + 1, y + 1, 2, 2);
      }
    }
    c.fillStyle = "#0d0e12";
    c.fillRect(0, top, W, 1);
  }
  c.fillStyle = "#d9a15c";
  c.fillRect(0, floor, W, H - floor);
  c.fillStyle = "#b9803f";
  c.fillRect(0, floor, W, 1);
  c.fillStyle = "#cfd6e4";
  c.fillRect(W - 12, floor - 34, 2, 34);
  c.fillStyle = "#f2f4f7";
  c.fillRect(W - 14, floor - 40, 6, 12);
  c.fillStyle = "#ee7a24";
  c.fillRect(W - 22, floor - 27, 9, 2);
  c.fillStyle = "rgba(255,255,255,.6)";
  for (let i = 0; i < 4; i++) c.fillRect(W - 21 + i * 2, floor - 25, 1, 5);
  c.fillStyle = "#ee7a24";
  c.fillRect(10, floor - 8, 7, 7);
  c.fillStyle = "#7a3a10";
  c.fillRect(13, floor - 8, 1, 7);
  c.fillRect(10, floor - 5, 7, 1);
}

function ball(c: CanvasRenderingContext2D, x: number, y: number): void {
  c.fillStyle = "#ee7a24";
  c.fillRect(x, y, 10, 10);
  c.fillStyle = "#7a3a10";
  c.fillRect(x + 4, y, 1, 10);
  c.fillRect(x, y + 4, 10, 1);
}

function fire(cv: HTMLCanvasElement, kind: "pop" | "shatter"): void {
  const c = cv.getContext("2d")!;
  c.clearRect(0, 0, cv.width, cv.height);
  ball(c, 10, 14);
  if (kind === "pop") {
    for (const [x, y, w, h, col] of [[11, 6, 3, 8, "#ffb347"], [15, 2, 3, 12, "#ff8a1f"], [19, 7, 3, 7, "#ffcf7a"], [13, 9, 2, 5, "#fff2b0"]] as const) {
      c.fillStyle = col;
      c.fillRect(x, y, w, h);
    }
  } else {
    c.fillStyle = "#ff8a1f";
    for (const [x, y] of [[3, 6], [24, 5], [2, 22], [26, 20], [14, 2], [22, 26]]) c.fillRect(x, y, 3, 3);
    c.fillStyle = "#ffcf7a";
    for (const [x, y] of [[6, 12], [24, 13], [8, 26]]) c.fillRect(x, y, 2, 2);
  }
}

function aim(cv: HTMLCanvasElement, kind: "arrow" | "dots"): void {
  const c = cv.getContext("2d")!;
  c.clearRect(0, 0, cv.width, cv.height);
  c.fillStyle = "#ee7a24";
  c.fillRect(3, 22, 7, 7);
  c.fillStyle = "#f2f4f7";
  if (kind === "arrow") {
    for (let i = 0; i < 14; i++) c.fillRect(Math.round(11 + i * 1.5), Math.round(20 - i * 1.1), 2, 2);
    c.fillRect(27, 3, 4, 2);
    c.fillRect(29, 3, 2, 6);
  } else {
    for (let i = 0; i < 5; i++) c.fillRect(Math.round(13 + i * 4.5), Math.round(19 - i * 3.4), 2, 2);
  }
}

function fade(cv: HTMLCanvasElement): void {
  const c = cv.getContext("2d")!;
  c.clearRect(0, 0, cv.width, cv.height);
  [1, 0.6, 0.3].forEach((a, i) => {
    c.globalAlpha = a;
    ball(c, 2 + i * 14, 6);
  });
  c.globalAlpha = 1;
}

const MP_BALLS: Record<"you" | "opp" | "gold", [string, string]> = { you: ["#e8731f", "#ff9a45"], opp: ["#3a8bd9", "#7ab8f0"], gold: ["#ffc83a", "#fff0a0"] };

/** A small pixel ball in a player colour (the avatars in the online screens). */
function mpBall(cv: HTMLCanvasElement, kind: "you" | "opp" | "gold"): void {
  const c = cv.getContext("2d")!;
  c.imageSmoothingEnabled = false;
  c.clearRect(0, 0, cv.width, cv.height);
  const rows = ["..1111..", ".122221.", "12233221", "12222221", "12222221", "12222221", ".122221.", "..1111.."];
  const [a, b] = MP_BALLS[kind];
  const col: Record<string, string> = { "1": "#0d0e12", "2": a, "3": b };
  const k = cv.width / 8;
  rows.forEach((r, y) => [...r].forEach((ch, x) => ch !== "." && ((c.fillStyle = col[ch]), c.fillRect(x * k, y * k, k, k))));
}

/** A tiny picture of a court for the lobby (Street, Gym, Arena). */
function courtThumb(cv: HTMLCanvasElement, name: string): void {
  const x = cv.getContext("2d")!;
  x.clearRect(0, 0, cv.width, cv.height);
  x.fillStyle = name === "Street" ? "#a8503a" : name === "Gym" ? "#2a4a9a" : "#10122a";
  x.fillRect(0, 0, 48, 18);
  if (name === "Street") {
    for (let y = 0; y < 18; y += 4)
      for (let i = 0; i < 48; i += 8) {
        x.fillStyle = "#b86a4a";
        x.fillRect(i + ((y / 4) % 2 ? 4 : 0), y, 7, 3);
      }
  } else if (name === "Gym") {
    for (let i = 0; i < 48; i += 3) {
      x.fillStyle = ["#e8731f", "#3a6fd9", "#f2f4f7", "#8a8e96"][(i / 3) % 4 | 0];
      x.fillRect(i, 6 + ((i / 3) % 2) * 4, 2, 3);
    }
  } else {
    x.fillStyle = "rgba(207,224,255,.3)";
    for (const [a, b, c] of [[10, 2, 18], [36, 28, 44]]) {
      x.beginPath();
      x.moveTo(a, 0);
      x.lineTo(b, 18);
      x.lineTo(c, 18);
      x.fill();
    }
  }
  x.fillStyle = name === "Street" ? "#6a6a78" : name === "Gym" ? "#e8a050" : "#2a2a50";
  x.fillRect(0, 18, 48, 10);
  x.fillStyle = "rgba(255,255,255,.5)";
  x.fillRect(0, 22, 48, 1);
}

/** Draws every picture in the window that asks for one (data-art="crowd-row", "fire-pop", "aim-dots", "fade", ...). */
export function drawSettingsArt(host: HTMLElement): void {
  host.querySelectorAll<HTMLCanvasElement>("canvas[data-art]").forEach((cv) => {
    const [kind, v] = (cv.dataset.art ?? "").split("-");
    if (kind === "crowd") scene(cv, v as CrowdArt);
    else if (kind === "fire") fire(cv, v as "pop" | "shatter");
    else if (kind === "aim") aim(cv, v as "arrow" | "dots");
    else if (kind === "fade") fade(cv);
    else if (kind === "court") courtThumb(cv, v);
    else if (kind === "ball") mpBall(cv, v as "you" | "opp" | "gold");
  });
}
