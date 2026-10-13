// The Discord button on the menu: a solid white pixel figure with see-through eyes (drawn on a grid, coloured by CSS).
const ROWS = ['......###......###......', '....################....', '...##################...', '..####################..', '..####################..', '.######################.', '.######################.', '.######################.', '######....####....######', '######....####....######', '######....####....######', '######....####....######', '########################', '########################', '########################', '.####...########...####.', '..#####..........#####..', '....###..........###....'];

export const DISCORD_ICON: string = (() => {
  const rects = ROWS.flatMap((row, y) => [...row].map((c, x) => (c === "#" ? `<rect x="${x}" y="${y}" width="1" height="1"/>` : ""))).join("");
  return `<svg viewBox="0 0 ${ROWS[0].length} ${ROWS.length}" width="${ROWS[0].length}" height="${ROWS.length}" fill="currentColor" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
})();
