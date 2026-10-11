// Dev tool: renders the real Hoops scenes (the same code as the Appearance preview) into 1600 x 1200 store images.
import "@fontsource/pixelify-sans/500.css";
import { Preview, setPreviewOverride } from "../src/preview";
import { THEMES } from "../src/themes";

const PW = Preview.W;
const PH = Preview.H;
const BG = "#23262d";
const ORANGE = "#ee7a24";
const LIGHT = "#f4f2ee";
const DARK = "#1c1c22";

async function capture(t: (typeof THEMES)[number]): Promise<HTMLCanvasElement> {
  setPreviewOverride({ ballSkin: t.ball, courtSkin: t.court, crowd: t.crowd });
  const cv = document.createElement("canvas");
  cv.width = PW;
  cv.height = PH;
  document.body.appendChild(cv);
  const p = new Preview(cv);
  // Step the scene by hand (about 1.1 s of it), so it does not depend on the browser running animation frames.
  const t0 = performance.now();
  for (let i = 0; i < 66; i++) (p as unknown as { draw(n: number): void }).draw(t0 + i * 16.7);
  const copy = document.createElement("canvas");
  copy.width = PW;
  copy.height = PH;
  copy.getContext("2d")!.drawImage(cv, 0, 0);
  cv.remove();
  return copy;
}

function shot(o: CanvasRenderingContext2D, src: HTMLCanvasElement, x: number, y: number, scale: number): void {
  const w = PW * scale;
  const h = PH * scale;
  o.fillStyle = DARK;
  o.fillRect(x - 8, y - 8, w + 16, h + 16);
  o.fillStyle = LIGHT;
  o.fillRect(x - 4, y - 4, w + 8, h + 8);
  o.imageSmoothingEnabled = false;
  o.drawImage(src, x, y, w, h);
}

function text(o: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, col: string, shadow = DARK, align: CanvasTextAlign = "center"): void {
  o.font = `500 ${size}px "Pixelify Sans", monospace`;
  o.textAlign = align;
  o.textBaseline = "alphabetic";
  const off = Math.max(3, Math.round(size / 24));
  o.fillStyle = shadow;
  o.fillText(s, x + off, y + off);
  o.fillStyle = col;
  o.fillText(s, x, y);
}

const TITLE = "HOOPS ALL ACCESS";

/** The subtitle: everything in the base colour, with "ONE PURCHASE." in orange. */
function subtitle(o: CanvasRenderingContext2D, x: number, y: number, size: number, base: string, shadow = DARK): void {
  o.font = `500 ${size}px "Pixelify Sans", monospace`;
  const a = "ALL COURTS. ALL THEMES. ";
  const b = "ONE PURCHASE.";
  const wa = o.measureText(a).width;
  const wb = o.measureText(b).width;
  const left = x - (wa + wb) / 2;
  text(o, a, left, y, size, base, shadow, "left");
  text(o, b, left + wa, y, size, ORANGE, shadow, "left");
}

async function main(): Promise<void> {
  await document.fonts.load('500 100px "Pixelify Sans"');
  const shots: Record<string, HTMLCanvasElement> = {};
  await capture(THEMES[0]); // warm-up: the very first scene can come out empty
  for (const t of THEMES) shots[t.id] = await capture(t);
  const make = (draw: (o: CanvasRenderingContext2D) => void): HTMLCanvasElement => {
    const c = document.createElement("canvas");
    c.width = 1600;
    c.height = 1200;
    c.className = "out";
    const o = c.getContext("2d")!;
    o.fillStyle = BG;
    o.fillRect(0, 0, 1600, 1200);
    draw(o);
    return c;
  };
  const ids = THEMES.map((t) => t.id);
  // 1: all nine real scenes, fanned across the picture, with the title on top
  const a = make((o) => {
    text(o, TITLE, 800, 200, 150, ORANGE);
    subtitle(o, 800, 290, 52, LIGHT);
    ids.forEach((id, i) => shot(o, shots[id], [10, 500, 990][i % 3], [372 + 8, 648 + 8, 924 + 8][Math.floor(i / 3)] - 8, 2));
  });
  // 2: one big real scene as the hero, three more underneath
  const b = make((o) => {
    text(o, TITLE, 800, 150, 140, ORANGE);
    subtitle(o, 800, 230, 48, LIGHT);
    shot(o, shots["arena"], 200, 290, 4);
    ["street", "led", "train-night"].forEach((id, i) => shot(o, shots[id], [10, 500, 990][i], 930, 2));
  });
  // 3: storefront banner: a wide scene above an orange band with the name and the theme names
  const c = make((o) => {
    shot(o, shots["train-canyon"], 50, 48, 5);
    o.fillStyle = DARK;
    o.fillRect(0, 800, 1600, 400);
    o.fillStyle = ORANGE;
    o.fillRect(0, 792, 1600, 10);
    text(o, TITLE, 800, 930, 128, ORANGE, "#000000");
    subtitle(o, 800, 1010, 50, LIGHT, "#000000");
    const names = THEMES.map((t) => t.name.toUpperCase());
    text(o, names.slice(0, 5).join("  ·  "), 800, 1100, 32, "#aeb4be", "#000000");
    text(o, names.slice(5).join("  ·  "), 800, 1148, 32, "#aeb4be", "#000000");
  });
  // One picture per paid theme, for the single-theme products
  const themeImgs = THEMES.filter((t) => t.price !== null).map((t) => {
    const img = make((o) => {
      shot(o, shots[t.id], 50, 48, 5);
      o.fillStyle = DARK;
      o.fillRect(0, 800, 1600, 400);
      o.fillStyle = ORANGE;
      o.fillRect(0, 792, 1600, 10);
      const name = t.name.toUpperCase();
      text(o, name, 800, 940, Math.min(140, Math.floor(1450 / (name.length * 0.58))), ORANGE, "#000000");
      o.font = `500 52px "Pixelify Sans", monospace`;
      const p1 = "ONE THEME. ";
      const p2 = "ONE PURCHASE.";
      const w1 = o.measureText(p1).width;
      const w2 = o.measureText(p2).width;
      const left = 800 - (w1 + w2) / 2;
      text(o, p1, left, 1030, 52, LIGHT, "#000000", "left");
      text(o, p2, left + w1, 1030, 52, ORANGE, "#000000", "left");
      text(o, "A HOOPS THEME", 800, 1120, 36, "#aeb4be", "#000000");
    });
    img.dataset.name = "hoops-theme-" + t.id;
    return img;
  });
  // Plain 3x pictures of every scene, for the website
  for (const t of THEMES) {
    const raw = document.createElement("canvas");
    raw.width = PW * 3;
    raw.height = PH * 3;
    raw.className = "raw";
    raw.dataset.name = "theme-" + t.id;
    const o = raw.getContext("2d")!;
    o.imageSmoothingEnabled = false;
    o.drawImage(shots[t.id], 0, 0, PW * 3, PH * 3);
    document.body.appendChild(raw);
  }
  const box = document.getElementById("o")!;
  [a, b, c, ...themeImgs].forEach((cv) => box.appendChild(cv));
  document.getElementById("st")!.textContent = "Done: 3 images";
  (window as unknown as { done: boolean }).done = true;
}
void main();
