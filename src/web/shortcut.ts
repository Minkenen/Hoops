// Browser stand-in for the Tauri global-shortcut plugin: plain key listeners on the page.
const handlers = new Map<string, (e: KeyboardEvent) => void>();
type Ev = { state: string };

export const isRegistered = async (key: string): Promise<boolean> => handlers.has(key);

export async function register(key: string, cb: (e: Ev) => void): Promise<void> {
  const h = (e: KeyboardEvent): void => {
    if (e.key === key) cb({ state: "Pressed" });
  };
  handlers.set(key, h);
  window.addEventListener("keydown", h);
}

export async function unregister(key: string): Promise<void> {
  const h = handlers.get(key);
  if (h) window.removeEventListener("keydown", h);
  handlers.delete(key);
}
