// The hoop sprites are drawn with canvases, but only their numbers (where the ring and the board are) matter to the server.
// This gives the sprite code a canvas that accepts every call and draws nothing, so the server can use the very same code as the game.
function context(): unknown {
  return new Proxy(() => undefined, {
    get: (_target, key) => (key === "canvas" ? {} : context()),
    set: () => true,
    apply: () => context(),
  });
}

export function installCanvasStub(): void {
  const g = globalThis as unknown as { document?: unknown };
  if (g.document) return;
  g.document = { createElement: () => ({ width: 0, height: 0, getContext: () => context(), toDataURL: () => "" }) };
}
