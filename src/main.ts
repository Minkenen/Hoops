import "@fontsource/pixelify-sans/400.css";
import "@fontsource/pixelify-sans/500.css";
import "./fonts.css";
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
import { checkForUpdate } from "./update";
import { onSettingChange, setSetting, settings } from "./settings";
import { setBackend } from "./leaderboard";
import { createRemoteLeaderboard } from "./leaderboardRemote";
import { connectLeaderboardScoreSync } from "./leaderboardSync";
import { startProfileSync } from "./profileSync";
import { LEADERBOARD_SERVER_URL } from "./config";
import { UI } from "./ui";

async function main(): Promise<void> {
  const leaderboardUrl = LEADERBOARD_SERVER_URL;
  if (leaderboardUrl) {
    const leaderboard = createRemoteLeaderboard(leaderboardUrl);
    setBackend(leaderboard);
    connectLeaderboardScoreSync(leaderboard);
    await Promise.race([leaderboard.refreshUser(), new Promise((r) => window.setTimeout(r, 4000))]);
    startProfileSync(leaderboardUrl, () => leaderboard.user(), () => window.dispatchEvent(new Event("storage")));
  }

  const monitors = await getMonitors();
  const label = currentLabel();
  const me = monitors.find((m) => m.label === label);
  if (!me) return;

  const cv = document.getElementById("game") as HTMLCanvasElement;
  const host = document.getElementById("ui") as HTMLElement;
  const ui = new UI(host);
  enforceOwned();
  const lookForUpdate = (): void => void checkForUpdate().then((u) => u && ui.setUpdate(u));
  lookForUpdate();
  window.setInterval(lookForUpdate, 6 * 3600 * 1000);
  if (me.index === 0) void recheckLicenses().then((changed) => changed && ui.refresh());
  const web = import.meta.env.VITE_TARGET === "web";
  if (web) {
    document.body.classList.add("web");
    // Small screens get a smaller pixel size so the court and hoop fit.
    if (window.innerWidth < 700 && !localStorage.getItem("hoops.settings")) setSetting("ballScale", 2);
    let resizing = 0;
    window.addEventListener("resize", () => {
      window.clearTimeout(resizing);
      resizing = window.setTimeout(() => game.active && game.rescale(), 150);
    });
  }
  const game = new Game(cv, me, monitors);
  ui.attach(game);
  if (import.meta.env.DEV) Object.assign(window, { __game: game, __ui: ui });
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

  if (web) {
    const goFull = (): void => void document.documentElement.requestFullscreen?.().catch(() => {});
    document.addEventListener("fullscreenchange", () => window.setTimeout(() => game.rescale(), 100));
    const fs = document.createElement("button");
    fs.id = "webfs";
    fs.textContent = "FULLSCREEN";
    fs.addEventListener("click", () => {
      if (document.fullscreenElement) void document.exitFullscreen();
      else goFull();
    });
    if (typeof document.documentElement.requestFullscreen === "function") document.body.appendChild(fs);
  }
  if (web) {
    const b = document.createElement("button");
    b.id = "webmenu";
    b.textContent = "MENU";
    b.title = "Menu (or right-click the ball)";
    b.addEventListener("click", () => ui.toggleMenu());
    document.body.appendChild(b);
  }
  window.setTimeout(preloadSounds, 800);
  if (await isWindowVisible()) game.intro();
}

main().catch((e) => console.error("Hooperly failed to start", e));
