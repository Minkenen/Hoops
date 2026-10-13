// The small beetle on the menu that opens the bug report. Line drawing, drawn as a mask so the colour comes from CSS.
const BEETLE = ['..#.......#..', '...#.....#...', '....#####....', '#...#...#...#', '.#.#..#..#.#.', '..##..#..##..', '...#..#..#...', '.###..#..###.', '#..#..#..#..#', '..##..#..##..', '##..#####..##'];

export const BEETLE_MASK: string = (() => {
  const rects = BEETLE.flatMap((row, y) => [...row].map((c, x) => (c === "#" ? `<rect x="${x + 1}" y="${y + 1}" width="1" height="1"/>` : ""))).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="13" viewBox="0 0 15 13" shape-rendering="crispEdges" fill="white">${rects}</svg>`;
  return `url('data:image/svg+xml,${encodeURIComponent(svg).replace(/'/g, "%27")}')`;
})();
