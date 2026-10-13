// Small pixel icons for the menu rows, drawn on a 7×7 grid and coloured by CSS (currentColor).
const ICONS: Record<string, string[]> = {
  look: [".#####.", "#.....#", "#.##..#", "#.##..#", "#.....#", ".#####.", "...#..."],
  ach: ["#######", ".#####.", "..###..", "...#...", "...#...", "..###..", ".#####."],
  online: [".#####.", "#..#..#", "#######", "#..#..#", "#######", "#..#..#", ".#####."],
  lb: ["....##.", ".##.##.", ".##.##.", ".##.##.", ".##.##.", "#######", "......."],
  prof: ["..###..", ".#####.", ".#####.", "..###..", ".#####.", "#######", "#######"],
  set: ["...#...", "#.###.#", ".#####.", "###.###", ".#####.", "#.###.#", "...#..."],
  quit: ["...#...", "#..#..#", "#..#..#", "#.....#", "#.....#", ".#####.", "......."],
};

export function menuIcon(name: keyof typeof ICONS): string {
  const rows = ICONS[name];
  const rects = rows.flatMap((r, y) => [...r].map((c, x) => (c === "#" ? `<rect x="${x}" y="${y}" width="1" height="1"/>` : ""))).join("");
  return `<svg class="mic" viewBox="0 0 7 7" width="18" height="18" fill="currentColor" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
}
