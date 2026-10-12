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
import { checkForUpdate } from "./update";
import { onSettingChange, settings } from "./settings";
import { setBackend } from "./leaderboard";
import { createRemoteLeaderboard } from "./leaderboardRemote";
import { connectLeaderboardScoreSync } from "./leaderboardSync";
import { UI } from "./ui";

async function main(): Promise<void> {
  const leaderboardUrl = (import.meta.env.VITE_LEADERBOARD_URL as string | undefined)?.trim();
  if (leaderboardUrl) {
    const leaderboard = createRemoteLeaderboard(leaderboardUrl);
    setBackend(leaderboard);
    connectLeaderboardScoreSync(leaderboard);
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
    window.addEventListener("resize", () => {
      if (game.active) game.rescale();
    });
  }
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

  if (web) {
    const gate = document.createElement("div");
    gate.id = "webgate";
    gate.innerHTML = '<div><h1>HOOPS</h1><p>Plays in fullscreen. Press Esc to leave.</p><button>PLAY FULLSCREEN</button><a href="../#download">Get the desktop app: play over your whole desktop</a></div>';
    document.body.appendChild(gate);
    const sync = (): void => {
      const full = !!document.fullscreenElement;
      gate.style.display = full ? "none" : "flex";
      if (full) window.setTimeout(() => game.rescale(), 100);
    };
    gate.querySelector("button")!.addEventListener("click", () => void document.documentElement.requestFullscreen().catch(() => {}));
    document.addEventListener("fullscreenchange", sync);
    sync();
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

main().catch((e) => console.error("Hoops failed to start", e));
