export const DARK = "#1c1c22";
export const HALO = "rgba(255,255,255,0.92)";

export type Put = (x: number, y: number, c: string) => void;

export function layer(
  ctx: CanvasRenderingContext2D,
  build: (put: Put) => void,
  passes: number[] = [2, 1, 0],
): void {
  for (const m of passes) {
    const pm = new Map<number, [number, number, string]>();
    const put: Put = (x, y, c) => {
      x = Math.round(x);
      y = Math.round(y);
      for (let j = -m; j <= m; j++) {
        for (let i = -m; i <= m; i++) {
          const xx = x + i;
          const yy = y + j;
          pm.set(yy * 16384 + xx, [xx, yy, c]);
        }
      }
    };
    build(put);
    const pc = m === 2 ? HALO : m === 1 ? DARK : null;
    for (const [x, y, c] of pm.values()) {
      ctx.fillStyle = pc ?? c;
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

const G7: Record<string, string[]> = {
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
};

export function textWidth(str: string, s: number): number {
  return str.length * 6 * s - s;
}

export function text(
  put: Put,
  str: string,
  x: number,
  y: number,
  s: number,
  top: string,
  bot: string,
): void {
  let cx = x;
  for (const ch of str) {
    const rows = G7[ch];
    if (rows) {
      const padded = ["00000", ...rows];
      padded.forEach((row, r) => {
        for (let c = 0; c < 5; c++) {
          if (row[c] === "1") {
            for (let sy = 0; sy < s; sy++) {
              for (let sx = 0; sx < s; sx++) {
                put(cx + c * s + sx, y + r * s + sy, r < 5 ? top : bot);
              }
            }
          }
        }
      });
    }
    cx += 6 * s;
  }
}

export function mix(a: string, b: string, t: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const A = p(a);
  const B = p(b);
  return "rgb(" + A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(",") + ")";
}

export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
export const rnd = (a: number, b: number): number => a + Math.random() * (b - a);
