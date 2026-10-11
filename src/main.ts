import "@fontsource/pixelify-sans/400.css";
import "@fontsource/pixelify-sans/500.css";
import "./styles.css";
import "./ui.css";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { Game } from "./game";
import {
  currentLabel,
  getMonitors,
  isWindowVisible,
  onCursorInside,
  onHandoff,
  onToggleMenu,
  setOverFullscreen,
} from "./ipc";
import { preloadSounds } from "./audio";
import { enforceOwned } from "./purchases";
import { recheckLicenses } from "./licensing";
import { onSettingChange, settings } from "./settings";
import { UI } from "./ui";

async function main(): Promise<void> {
  const monitors = await getMonitors();
  const label = currentLabel();
  const me = monitors.find((m) => m.label === label);
  if (!me) return;

  const cv = document.getElementById("game") as HTMLCanvasElement;
  const host = document.getElementById("ui") as HTMLElement;
  const ui = new UI(host);
  enforceOwned();
  if (me.index === 0) void recheckLicenses().then((changed) => changed && ui.refresh());
  const game = new Game(cv, me, monitors);
  ui.attach(game);
  game.ui = ui;

  await onHandoff((p) => game.receive(p));
  await onCursorInside((inside) => ui.cursorInside(inside));
  await onToggleMenu(() => {
    if (game.active) ui.toggleMenu();
  });

  onSettingChange((k) => {
    if (k === "ballScale") {
      game.rescale();
      ui.refresh();
    } else if (k === "ballSkin" || k === "courtSkin") {
      game.applyCosmetics();
    } else if (k === "fullscreen") {
      void setOverFullscreen(settings.fullscreen);
    } else if (k === "autostart") {
      void (settings.autostart ? enable() : disable());
    }
  });

  window.addEventListener("storage", () => {
    if (game.active) ui.refresh();
  });

  void setOverFullscreen(settings.fullscreen);
  try {
    const on = await isEnabled();
    if (on !== settings.autostart && label === "overlay-0") {
      void (settings.autostart ? enable() : disable());
    }
  } catch {
    /* autostart unavailable in dev */
  }

  window.setTimeout(preloadSounds, 800);
  if (await isWindowVisible()) game.intro();
}

main().catch((e) => console.error("Hoops failed to start", e));
