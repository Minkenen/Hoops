import { isRegistered, register, unregister } from "@tauri-apps/plugin-global-shortcut";
import { type Sfx, play } from "./audio";
import type { Game } from "./game";
import { activateLicense, focusWindow, openExternal, type Rect, quitApp } from "./ipc";
import { PREMIUM_CHECKOUT_URL, THEME_CHECKOUT_URLS } from "./config";
import { addLicense, getBestScore, getScore, setOnboarded, setPremiumUnlocked, setSetting, settings } from "./settings";
import type { Settings } from "./settings";
import { Preview, setPreviewOverride } from "./preview";
import { addOwnedTheme, isItemOwned, isOwned, resetPurchases } from "./purchases";
import { ALL_ACCESS_PRICE, ALL_ACCESS_VALUE, PRICE_VALUE, THEMES, type ThemeId, themeById } from "./themes";
import { ACHIEVEMENTS, getStats } from "./stats";
import type { UpdateInfo } from "./update";
import { backend, LEADERBOARD_ON, type LbBoard, type LbEntry, type LbProviderId, type LbTab } from "./leaderboard";
import { BALL_SKINS, BASE_SKINS, COURT_SKINS, CROWD_STYLES } from "./skins";

type View = "none" | "menu" | "settings" | "cosmetics" | "sound" | "achievements" | "leaderboard" | "onboarding";
type DonateVariant = "button" | "footer";

const DONATE_URL = "https://ko-fi.com/hoopsgame";
const DONATE_AB_KEY = "hoops.donate.ab";

const isMac = /Mac/i.test(navigator.platform);
const SHORTCUT = isMac
  ? "<span class=\"kb\">Ctrl+Option+Cmd+B</span>"
  : "<span class=\"kb\">Ctrl+Alt+Win+B</span>";

const fmt: Record<string, (v: number) => string> = {
  confetti: (v) => (v === 0 ? "Av" : String(v)),
  bubble: (v) => v.toFixed(1) + " s",
  volume: (v) => Math.round(v * 100) + " %",
  ballFade: (v) => (v === 0 ? "Solid" : Math.round(v * 100) + " %"),
};

const TROPHY_COL: Record<string, string> = { o: "#0d0e12", y: "#ffc83a", h: "#fff3b0", d: "#c98a12" };
const TROPHY = [
  "............",
  ".oooooooooo.",
  ".oyyyyyyyyo.",
  "oooyhyyyyooo",
  "oyoyhyyydoyo",
  "oyoyyyyydoyo",
  ".ooyyyyyydoo.",
  "..oyyyyyydo..",
  "...oodddoo...",
  "....oydo....",
  "....oyyo....",
  "..oooooooo..",
];

interface DonateStats {
  next: DonateVariant;
  button: { views: number; clicks: number };
  footer: { views: number; clicks: number };
}

const DONATE_DEFAULTS: DonateStats = {
  next: "button",
  button: { views: 0, clicks: 0 },
  footer: { views: 0, clicks: 0 },
};

function donateStats(): DonateStats {
  try {
    const v = JSON.parse(localStorage.getItem(DONATE_AB_KEY) ?? "");
    return {
      next: v.next === "footer" ? "footer" : "button",
      button: {
        views: Number(v.button?.views ?? 0) || 0,
        clicks: Number(v.button?.clicks ?? 0) || 0,
      },
      footer: {
        views: Number(v.footer?.views ?? 0) || 0,
        clicks: Number(v.footer?.clicks ?? 0) || 0,
      },
    };
  } catch {
    return structuredClone(DONATE_DEFAULTS);
  }
}

function saveDonateStats(stats: DonateStats): void {
  try {
    localStorage.setItem(DONATE_AB_KEY, JSON.stringify(stats));
  } catch {
    /* ignore */
  }
}

function rate(views: number, clicks: number): string {
  return views ? Math.round((clicks / views) * 100) + " %" : "0 %";
}

export class UI {
  view: View = "none";
  private step = 0;
  private resetDialog = false;
  private premiumDialog = false;
  private licenseStep = false;
  private licenseBusy = false;
  private licenseError = "";
  private licenseDraft = "";
  private unlockTheme: ThemeId | null = null;
  private toastMsg = "";
  private viewTheme: ThemeId | null = null;
  private game!: Game;
  private awayTimer = 0;
  private donateVariant: DonateVariant = "button";
  /** The windows we came from, so Back goes one step back. */
  private stack: View[] = [];
  private backKeyOn = false;
  private update: UpdateInfo | null = null;
  private lbTab: LbTab = "global";
  private lbBoards: Partial<Record<LbTab, LbBoard>> = {};
  private lbBusy = false;
  private lbSigning = false;
  private lbError = "";
  private lbSkip = (() => {
    try {
      return localStorage.getItem("hoops.lb.skip") === "1";
    } catch {
      return false;
    }
  })();

  constructor(private host: HTMLElement) {
    host.addEventListener("click", (e) => this.onClick(e));
    host.addEventListener("input", (e) => this.onInput(e));
    host.addEventListener("keydown", (e) => {
      const el = e.target as HTMLElement;
      if (e.key === "Enter" && el.id === "lic") void this.activate();
      else if (e.key === "Backspace" && el.tagName !== "INPUT" && el.tagName !== "TEXTAREA" && this.view !== "none" && this.view !== "menu") {
        e.preventDefault();
        this.back();
      }
    });
  }

  /** A newer version exists: the menu shows an update button. */
  setUpdate(u: UpdateInfo): void {
    this.update = u;
    if (this.view === "menu") this.render();
  }

  attach(game: Game): void {
    this.game = game;
  }

  toggleMenu(): void {
    if (this.view === "menu") this.close();
    else if (this.view === "none") this.openMenu();
  }

  openMenu(): void {
    this.pickDonateVariant();
    this.stack = [];
    this.view = "menu";
    this.render();
  }

  /** Switches window and remembers where we came from. */
  private go(v: View): void {
    if (this.view !== "none" && this.view !== v && this.view !== "onboarding") this.stack.push(this.view);
    this.view = v;
    this.render();
  }

  /** One step back: first out of a dialog, then to the window before this one. */
  back(): void {
    if (this.resetDialog || this.premiumDialog) {
      if (this.licenseStep && !this.licenseBusy) {
        this.licenseStep = false;
        this.licenseError = "";
      } else {
        this.resetDialog = false;
        this.closePremium();
      }
      this.render();
      return;
    }
    const prev = this.stack.pop();
    if (prev) {
      this.view = prev;
      this.render();
    } else if (this.view !== "menu" && this.view !== "none") this.close();
  }

  /** Backspace goes back, from anywhere while a window is open (but not while you are typing a license key). */
  private syncBackKey(): void {
    const want = (this.view === "settings" || this.view === "sound" || this.view === "cosmetics" || this.view === "achievements" || this.view === "leaderboard") && !this.licenseStep;
    if (want === this.backKeyOn) return;
    this.backKeyOn = want;
    if (want) {
      void isRegistered("Backspace")
        .then((on) => (on ? undefined : register("Backspace", (e) => e.state === "Pressed" && this.back())))
        .catch(() => undefined);
    } else {
      void unregister("Backspace").catch(() => undefined);
    }
  }

  openSettings(): void {
    this.go("settings");
  }

  openLeaderboard(): void {
    this.go("leaderboard");
    void this.loadBoard();
  }

  private async loadBoard(): Promise<void> {
    const tab = this.lbTab;
    if (!backend.available) return;
    this.lbBusy = true;
    this.lbError = "";
    this.render();
    try {
      this.lbBoards[tab] = await backend.load(tab);
    } catch (e) {
      this.lbError = e instanceof Error ? e.message : "Could not load the board.";
    }
    this.lbBusy = false;
    if (this.view === "leaderboard") this.render();
  }

  private async signInWith(p: LbProviderId): Promise<void> {
    this.lbSigning = true;
    this.lbError = "";
    this.render();
    try {
      await backend.signIn(p);
      this.lbBoards = {};
      this.lbSigning = false;
      await this.loadBoard();
      return;
    } catch (e) {
      this.lbError = e instanceof Error ? e.message : "Could not sign in.";
    }
    this.lbSigning = false;
    this.render();
  }

  private lbBall(i: number): string {
    const pal = [["#e8731f", "#ff9a45"], ["#ffc83a", "#fff0a0"], ["#3a8bd9", "#7ab8f0"], ["#3ab36a", "#7ad89a"], ["#a24ad9", "#cf8af0"], ["#e8392b", "#ff8a7a"], ["#8a8e96", "#c4c8d0"]][i % 7];
    return this.pixIcon(["..1111..", ".122221.", "12233221", "12222221", "12222221", "12222221", ".122221.", "..1111.."], ["#0d0e12", pal[0], pal[1]], 2);
  }

  private lbRow(e: LbEntry, me = false): string {
    return `<div class="lt${me ? " me" : ""}"><span class="rk">${e.rank}</span>${this.lbBall(e.icon)}<b>${e.name}</b><span class="sc">${e.score}</span></div>`;
  }

  private leaderboardHtml(): string {
    const board = this.lbBoards[this.lbTab];
    const user = backend.user();
    const s = getStats();
    const acc = s.throws > 0 ? Math.round((s.goals / s.throws) * 100) : 0;
    const tabs = (["global", "weekly", "friends"] as LbTab[])
      .map((t) => `<button class="pb${t === this.lbTab ? " on" : ""}" data-a="lbtab" data-v="${t}">${t[0].toUpperCase() + t.slice(1)}</button>`)
      .join("");
    let body: string;
    if (!backend.available) {
      body = `<div class="hn" style="padding:14px 4px">The leaderboard opens soon. Your scores are kept, and will count once it is open.</div>`;
    } else if (!board) {
      body = this.lbError ? `<div class="err" style="padding:12px 4px">${this.lbError}</div>` : `<div class="hn" style="padding:14px 4px">Loading…</div>`;
    } else {
      const rows = board.top.map((e) => this.lbRow(e)).join("");
      const you = board.you ? (board.you.rank > board.top.length ? `<div class="lt gap">· · ·</div>` : "") + this.lbRow(board.you, true) : "";
      const ago = Math.max(1, Math.round((Date.now() - board.updatedAt) / 60000));
      body = `<div class="h4">Top players</div>${rows}${you}
<div class="note">Updated ${ago === 1 ? "a minute" : ago + " minutes"} ago · ${board.players.toLocaleString("en-US")} players${this.lbBusy ? " · refreshing…" : ""}</div>`;
    }
    const login =
      backend.available && !user && !this.lbSkip
        ? `<div class="px login"><b>Join the board?</b><div class="hn" style="margin:2px 0 8px">Sign in to get a rank. Your game keeps working without it, and stays on your computer.</div>
<button class="pb full gold lbsign" data-a="signin" data-v="apple"${this.lbSigning ? " disabled" : ""}>${this.pixIcon([".....11.", "....11..", "..11.11.", ".111111.", "1111111.", "1111111.", "1111111.", ".111.11.", "..1..1.."], ["#1c1c22"], 2)}Sign in with Apple</button>
<button class="pb full lbsign" data-a="signin" data-v="google"${this.lbSigning ? " disabled" : ""}>${this.pixIcon([".11111.", "1111111", "11.....", "11.1111", "11...11", "1111111", ".11111."], ["#ffffff"], 2)}Sign in with Google</button>
<button class="pb full" style="text-align:center" data-a="lbskip">Not now</button>${this.lbError && board ? `<div class="err">${this.lbError}</div>` : ""}</div>`
        : user
          ? `<div class="note" style="margin-top:6px">Signed in as <b>${user.nickname}</b> · <button class="lnk" data-a="signout">Sign out</button></div>`
          : "";
    return `<div class="px win" data-hit style="width:min(310px,94vw)">
<div class="wt"><span class="wl"><button class="pb" data-a="back" aria-label="Back">←</button>Leaderboard</span><button class="pb" data-a="close" aria-label="Close">×</button></div>
<div class="wb">
<div class="seg">${tabs}</div>
${body}
<div class="lbstat"><div><small>Best score</small><b>${getBestScore()}</b></div><div><small>Best streak</small><b>${s.bestStreak}</b></div><div><small>Accuracy</small><b>${acc}%</b></div></div>
${login}
</div></div>`;
  }

  openSound(): void {
    this.go("sound");
  }

  openCosmetics(): void {
    this.go("cosmetics");
  }

  openOnboarding(): void {
    this.view = "onboarding";
    this.step = 0;
    this.render();
  }

  close(): void {
    this.stack = [];
    this.view = "none";
    this.resetDialog = false;
    this.closePremium();
    this.render();
  }

  cursorInside(inside: boolean): void {
    clearTimeout(this.awayTimer);
    if (inside || this.view !== "menu") return;
    this.awayTimer = window.setTimeout(() => {
      if (this.view === "menu") this.close();
    }, 1200);
  }

  rects(): Rect[] {
    const out: Rect[] = [];
    this.host.querySelectorAll<HTMLElement>("[data-hit]").forEach((el) => {
      const r = el.getBoundingClientRect();
      out.push({ x: r.left - 6, y: r.top - 6, w: r.width + 12, h: r.height + 12 });
    });
    return out;
  }

  refresh(): void {
    if (this.view !== "none") this.render();
  }

  toast(m: string, ms = 1800): void {
    this.toastMsg = m;
    this.render();
    setTimeout(() => {
      if (this.toastMsg === m) {
        this.toastMsg = "";
        this.render();
      }
    }, ms);
  }

  /** Card that slides down from the top edge, separate from the menu render so the animation is not restarted. */
  showAchievement(name: string): void {
    const el = document.createElement("div");
    el.className = "ach-toast";
    el.innerHTML = `<canvas width="12" height="12"></canvas><div><div class="k">ACHIEVEMENT UNLOCKED</div><div class="n"></div></div>`;
    el.querySelector(".n")!.textContent = name;
    const c = el.querySelector("canvas")!.getContext("2d")!;
    TROPHY.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        const col = TROPHY_COL[ch];
        if (col) {
          c.fillStyle = col;
          c.fillRect(x, y, 1, 1);
        }
      }),
    );
    document.body.appendChild(el);
    window.setTimeout(() => el.remove(), 3700);
  }

  openAchievements(): void {
    this.go("achievements");
  }

  private seg(k: keyof Settings, opts: [string | number, string][]): string {
    return (
      "<div>" +
      opts
        .map(
          ([v, l]) =>
            `<button class="pb${settings[k] === v ? " on" : ""}" data-a="set" data-k="${k}" data-v="${v}">${l}</button>`,
        )
        .join("") +
      "</div>"
    );
  }

  private tog(k: keyof Settings): string {
    return `<button class="tg${settings[k] ? " on" : ""}" data-a="tog" data-k="${k}" aria-pressed="${settings[k]}" aria-label="${k}"></button>`;
  }

  private sld(k: string, min: number, max: number, step: number): string {
    const v = settings[k as keyof Settings] as number;
    return `<div class="sl"><input type="range" min="${min}" max="${max}" step="${step}" value="${v}" data-k="${k}" aria-label="${k}"><span class="val" data-val="${k}">${fmt[k](v)}</span></div>`;
  }

  private row(label: string, ctl: string, hint?: string): string {
    return `<div class="row"><div><div class="lb">${label}</div>${hint ? `<div class="hn">${hint}</div>` : ""}</div>${ctl}</div>`;
  }

  private pickDonateVariant(): void {
    const stats = donateStats();
    const v = stats.next;
    this.donateVariant = v;
    stats[v].views++;
    stats.next = v === "button" ? "footer" : "button";
    saveDonateStats(stats);
  }

  private donateHtml(): string {
    if (this.donateVariant === "footer") {
      return `<button class="donate-footer" data-a="donate" data-v="footer"><span>Enjoying Hoops?</span><b>Donate a coffee</b></button>`;
    }
    return `<button class="pb full donate-cta" data-a="donate" data-v="button">Support Hoops</button>`;
  }

  private donateStatsHtml(): string {
    const s = donateStats();
    const b = s.button;
    const f = s.footer;
    return `<div class="h4">Donate test</div>
${this.row("Orange button", `<span class="val">${b.clicks}/${b.views}</span>`, rate(b.views, b.clicks))}
${this.row("Footer panel", `<span class="val">${f.clicks}/${f.views}</span>`, rate(f.views, f.clicks))}
<button class="pb full" data-a="donatestats">Show donate test stats</button>`;
  }

  private tile(k: "autostart" | "fullscreen", v: 0 | 1, title: string, desc: string): string {
    const on = !!settings[k] === (v === 1);
    return `<button class="tile${on ? " on" : ""}" data-a="opt" data-k="${k}" data-v="${v}"><b>${title}</b><span>${desc}</span></button>`;
  }

  private menuHtml(): string {
    const b = this.game.ballCss();
    const vp = this.game.viewport();
    const W = 250;
    const right = b.x + b.r + 18 + W + 10 < vp.w;
    const left = right ? b.x + b.r + 18 : b.x - b.r - 18 - W;
    const bottom = vp.h - this.game.floorCss() + 6;
    return `<div class="px menu" data-hit style="left:${Math.max(8, left)}px;bottom:${bottom}px;width:${W}px">
<div class="row" style="padding:2px 0"><span class="lb">Score</span><b class="score">${getScore()}</b></div><div class="hr"></div>
${this.update ? `<button class="pb buy full" data-a="update">Update available: v${this.update.version}</button>` : ""}
${this.row("Aim line", this.seg("arrow", [["arrow", "Arrow"], ["dots", "Dotted"]]))}
${this.row("Sound", this.tog("sound"))}
<div class="hr"></div>
<button class="pb full" data-a="cos">Appearance…</button>
<button class="pb full" data-a="ach">Achievements…</button>
${LEADERBOARD_ON ? `<button class="pb full lbl" data-a="lb"><span>Leaderboard…</span>${this.lbBoards.global?.you ? `<small>#${this.lbBoards.global.you.rank}</small>` : ""}</button>` : ""}
<button class="pb full" data-a="inst">Settings…</button>
${this.donateHtml()}
<button class="pb full danger" data-a="quit">Quit Hoops</button></div>`;
  }

  private settingsHtml(): string {
    return `<div class="px win" data-hit style="width:min(470px,92vw)">
<div class="wt"><span class="wl"><button class="pb" data-a="back" aria-label="Back">←</button>Settings</span><button class="pb" data-a="close" aria-label="Close">×</button></div>
<div class="wb">
<div class="h4">Game</div>
${this.row("Keep the court open", this.tog("stayOpen"), "Click outside the ball or press Esc to close")}
${this.row("Ball on fire", this.seg("fireStyle", [["pop", "Fireball"], ["shatter", "Shatter"]]), "How the ball lights up after three goals in a row")}
${this.row("Line while aiming", this.seg("arrow", [["arrow", "Arrow"], ["dots", "Dotted"]]))}
${this.row("Confetti", this.sld("confetti", 0, 300, 10))}
${this.row("Score bubble", this.sld("bubble", 1, 5, 0.5), "How long it stays")}
${this.row("Sound", this.tog("sound"))}
${this.row("Volume", this.sld("volume", 0, 1, 0.05))}
<button class="pb full" data-a="snd" style="margin-top:6px">Advanced sound…</button>
<button class="pb full" data-a="mile">Play a milestone</button>
<button class="pb full" data-a="achtest">Play an achievement</button>
<button class="pb full" data-a="firetest">Light or put out the ball</button>
${import.meta.env.DEV ? `<button class="pb full" data-a="resetpremium">Lock premium again (dev)</button>` : ""}
<div class="h4">Appearance</div>
${this.row("Ball see-through at rest", this.sld("ballFade", 0, 0.8, 0.05), "So you can see what is behind it")}
${this.row("Basketball court", this.tog("court"), "Shown while aiming")}
<button class="pb full" data-a="cos" style="margin-top:6px">Edit appearance…</button>
<div class="h4">System</div>
${this.row("Start automatically", this.tog("autostart"), "When your computer starts")}
${this.row("Over fullscreen apps", this.tog("fullscreen"), "Games and video")}
${this.row("Menu shortcut", SHORTCUT)}
${this.donateStatsHtml()}
<div class="acts"><button class="pb" data-a="reset">Reset score</button><button class="pb danger" data-a="quit">Quit Hoops</button></div>
</div></div>`;
  }

  private closePremium(): void {
    this.premiumDialog = false;
    this.licenseStep = false;
    this.licenseBusy = false;
    this.licenseError = "";
    this.licenseDraft = "";
    this.unlockTheme = null;
  }

  /** Checks the typed license key (in Rust) and unlocks All Access when it is good. */
  private async activate(): Promise<void> {
    const key = this.licenseDraft.trim();
    if (this.licenseBusy) return;
    if (!key) {
      this.licenseError = "Enter your license key.";
      this.render();
      return;
    }
    this.licenseBusy = true;
    this.licenseError = "";
    this.render();
    try {
      const result = await activateLicense(key);
      addLicense({ key, unlock: result.unlock, theme: result.theme_id });
      if (result.unlock === "all") {
        setPremiumUnlocked(true);
        this.toast("All Access unlocked");
      } else {
        addOwnedTheme(result.theme_id as ThemeId);
        this.toast(`${themeById(result.theme_id).name} unlocked`);
      }
      this.closePremium();
    } catch (err) {
      this.licenseBusy = false;
      const msg = typeof err === "string" ? err : "Could not check the license key. Try again.";
      this.licenseError = msg.includes("activate_license")
        ? "This Hoops build is too old. Install or run the latest build and try again."
        : msg;
      this.render();
    }
  }

  /** The big All Access button, with what it saves compared to buying the locked themes one by one. */
  private allAccessButton(): string {
    const left = THEMES.filter((t) => t.price !== null && !isOwned(t.id)).length;
    const sum = left * PRICE_VALUE;
    const save = sum - ALL_ACCESS_VALUE;
    const line =
      save >= 1
        ? `Save $${save.toFixed(2)} (${Math.round((save / sum) * 100)}%) compared to buying ${left} themes one by one`
        : "Every theme, one payment, and the ones to come";
    return `<button class="pb buy allacc" data-a="premium"><span class="ah">${this.lockIcon()} Unlock All Access ${ALL_ACCESS_PRICE}</span><small>${line}</small></button>`;
  }

  private premiumDialogHtml(): string {
    const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
    const theme = this.unlockTheme ? themeById(this.unlockTheme) : null;
    const title = theme ? `Unlock ${theme.name}` : "Unlock All Access";
    const summary = theme
      ? `Get ${theme.name} on its own, or unlock everything with All Access. No subscription.`
      : `One payment of ${ALL_ACCESS_PRICE} unlocks every court, theme, ball and crowd. No subscription.`;
    const body = this.licenseStep
      ? `<div class="hn">Paste the license key from your purchase email.</div>
<input class="lic" id="lic" type="text" value="${esc(this.licenseDraft)}" placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX" autocomplete="off" spellcheck="false"${this.licenseBusy ? " disabled" : ""}>
${this.licenseError ? `<div class="err">${esc(this.licenseError)}</div>` : ""}
<div class="acts"><button class="pb buy" data-a="activate"${this.licenseBusy ? " disabled" : ""}>${this.licenseBusy ? "Activating…" : "Activate"}</button><button class="pb" data-a="licback"${this.licenseBusy ? " disabled" : ""}>Cancel</button></div>`
      : `<div class="hn">${summary}</div>
<div class="acts" style="flex-direction:column;align-items:stretch">
${theme && THEME_CHECKOUT_URLS[theme.id] ? `<button class="pb buy" data-a="buytheme" data-v="${theme.id}" style="justify-content:center">Buy ${theme.name}</button>` : ""}
<button class="pb buy" data-a="buypremium" style="justify-content:center">Buy All Access ${ALL_ACCESS_PRICE}</button>
<button class="pb" data-a="haskey">I already have a license</button>
<button class="lnk" data-a="notnow" style="align-self:center">Not now</button>
</div>`;
    return `<div class="confirm-wrap" data-hit>
<div class="px confirm">
<div class="h4" style="margin-top:0">${this.lockIcon()} ${title}</div>
${body}
</div>
</div>`;
  }

  private resetDialogHtml(): string {
    return `<div class="confirm-wrap" data-hit>
<div class="px confirm">
<div class="h4" style="margin-top:0">Reset score?</div>
<div class="lb">Are you sure?</div>
<div class="hn">This clears your score and current match stats.</div>
<div class="acts"><button class="pb" data-a="cancelreset">Cancel</button><button class="pb danger" data-a="confirmreset">Reset score</button></div>
</div>
</div>`;
  }

  private skinTile(k: keyof Settings, id: string, name: string, preview: string, desc?: string): string {
    const on = settings[k] === id;
    return `<button class="tile${on ? " on" : ""}" data-a="set" data-k="${k}" data-v="${id}">${preview}<b>${name}</b>${desc ? `<span>${desc}</span>` : ""}</button>`;
  }

  private pixIcon(rows: string[], cols: string[], sz = 2): string {
    let r = "";
    rows.forEach((row, j) => [...row].forEach((c, i) => c !== "." && (r += `<rect x="${i}" y="${j}" width="1" height="1" fill="${cols[Number(c) - 1]}"/>`)));
    return `<svg width="${rows[0].length * sz}" height="${rows.length * sz}" viewBox="0 0 ${rows[0].length} ${rows.length}" style="shape-rendering:crispEdges;display:block">${r}</svg>`;
  }

  private lockIcon(sz = 2): string {
    return this.pixIcon(["...1111...", "..11..11..", "..11..11..", "..11..11..", ".22222222.", ".22222222.", ".22211222.", ".22211222.", ".22222222.", ".22222222."], ["#ffc83a", "#ffc83a"], sz);
  }

  private coinIcon(sz = 2): string {
    const rows: string[] = [];
    for (let j = -4; j <= 4; j++) {
      let r = "";
      for (let i = -4; i <= 4; i++) {
        const d = i * i + j * j;
        r += d > 17 ? "." : d > 10 ? "1" : i === 0 && j > -3 && j < 3 ? "3" : "2";
      }
      rows.push(r);
    }
    return this.pixIcon(rows, ["#a8791a", "#ffd84a", "#fff6c0"], sz);
  }

  private checkIcon(sz = 2): string {
    return this.pixIcon(["........1", ".......11", "1.....11.", "11...11..", ".11.11...", "..111....", "...1....."], ["#1c1c22"], sz);
  }

  private priceBadge(price: string | null): string {
    return price ? `<span class="badge">${this.coinIcon()}${price}</span>` : `<span class="badge free">FREE</span>`;
  }

  private applyTheme(id: ThemeId): void {
    const t = themeById(id);
    setSetting("ballSkin", t.ball);
    setSetting("courtSkin", t.court);
    setSetting("crowd", t.crowd);
    setSetting("theme", id);
    this.viewTheme = null;
  }

  private cosmeticsHtml(): string {
    const view = themeById(this.viewTheme ?? settings.theme);
    const using = !this.viewTheme || this.viewTheme === settings.theme;
    setPreviewOverride(using ? null : { ballSkin: view.ball, courtSkin: view.court, crowd: view.crowd });
    const cur = themeById(settings.theme);
    const custom = cur.ball !== settings.ballSkin || cur.court !== settings.courtSkin || cur.crowd !== settings.crowd;
    const row = (t: (typeof THEMES)[number]): string => {
      const own = isOwned(t.id);
      const sk = COURT_SKINS.find((s) => s.id === t.court);
      const sw = sk ? `background:linear-gradient(90deg,${sk.zone[0]} 0 38%,${sk.wood[0]} 38% 69%,${sk.wood[1]} 69%)` : "";
      const price = settings.theme !== t.id && !own ? `<span class="pr">${this.lockIcon()}${t.price}</span>` : "";
      const check = settings.theme === t.id ? this.checkIcon() : "";
      return `<button class="trow${view.id === t.id ? " on" : ""}${own ? "" : " lk"}" data-a="viewtheme" data-v="${t.id}"><i class="tsw" style="${sw}"></i><span class="tn">${t.name}${price}</span>${check}</button>`;
    };
    const action = isOwned(view.id)
      ? settings.theme === view.id
        ? `<button class="pb on">In use</button>`
        : `<button class="pb on" data-a="usetheme" data-v="${view.id}">Use theme</button>`
      : `<button class="pb buy" data-a="themeunlock" data-v="${view.id}">${this.lockIcon()} Unlock ${view.price}</button>`;
    const ballName = BALL_SKINS.find((s) => s.id === view.ball)?.name ?? "";
    const courtName = COURT_SKINS.find((s) => s.id === view.court)?.name ?? "";
    const crowdName = CROWD_STYLES.find((s) => s.id === view.crowd)?.name ?? "";
    const balls = BALL_SKINS.filter((s) => isItemOwned("ball", s.id))
      .map((s) => this.skinTile("ballSkin", s.id, s.name, `<i class="sw ball" style="background:radial-gradient(circle at 35% 30%,${s.pal[2]},${s.pal[1]} 55%,${s.pal[0]})"></i>`))
      .join("");
    const courts = COURT_SKINS.filter((s) => isItemOwned("court", s.id))
      .map((s) => this.skinTile("courtSkin", s.id, s.name, `<i class="sw plan" style="background:linear-gradient(90deg,${s.zone[0]} 0 38%,${s.wood[0]} 38% 69%,${s.wood[1]} 69%)"></i>`))
      .join("");
    const crowds = CROWD_STYLES.filter((s) => isItemOwned("crowd", s.id))
      .map((s) => this.skinTile("crowd", s.id, s.name, "", s.description))
      .join("");
    const bases = BASE_SKINS.map((s) => this.skinTile("baseSkin", s.id, s.name, "")).join("");
    const lockedAny = THEMES.some((t) => !isOwned(t.id));
    return `<div class="px win" data-hit style="width:min(600px,94vw)">
<div class="wt"><span class="wl"><button class="pb" data-a="back" aria-label="Back">←</button>Appearance</span><button class="pb" data-a="close" aria-label="Close">×</button></div>
<div class="wb">
<div class="two"><div class="tlist">${THEMES.map(row).join("")}</div>
<div class="tbig"><canvas class="prev" id="prev" width="${Preview.W}" height="${Preview.H}" aria-label="Preview"></canvas>
<div class="thead"><b>${view.name}</b>${this.priceBadge(view.price)}</div>
<div class="hn">${crowdName}, ${courtName}, ${ballName} ball</div>
<div class="acts" style="margin-top:6px">${action}</div></div></div>
${lockedAny ? this.allAccessButton() : ""}
<div class="h4">Your look${custom ? " (custom)" : ""}</div>
<div class="h4" style="margin-top:2px">Ball</div><div class="tiles w">${balls}</div>
<div class="h4">Court</div>${this.row("Show court", this.tog("court"), "While aiming")}<div class="tiles w">${courts}</div>
<div class="h4">Crowd</div>${this.row("Fill the screen", this.tog("arenaFill"), "Crowd and arena reach the top")}<div class="tiles w">${crowds}</div>
<div class="h4">Pole base</div><div class="tiles w">${bases}</div>
${lockedAny ? `<div class="note">${this.lockIcon()}<span>More choices appear when you unlock more themes.</span></div>` : ""}
<div class="acts"><button class="pb" data-a="inst">Settings…</button></div>
</div></div>`;
  }

  private soundHtml(): string {
    const rows: [keyof Settings, string, string, string][] = [
      ["sfxBounce", "Bounces", "Ball hits the floor, walls, board and rim", "bounce"],
      ["sfxShoot", "Shooting", "Stretching the ball and letting go", "shoot"],
      ["sfxGoal", "Goals", "Cheer, boom, crowd, swish and the gasp when the ball hits the rim", "cheer"],
      ["sfxMilestone", "Milestones", "25, 50, 100 goals and every 100 after", "milestone"],
      ["sfxAchievement", "Achievements", "Ping and pop when you unlock one", "achievement"],
      ["sfxUi", "Menus and hoop", "Menu clicks and the hoop sliding in", "ui"],
    ];
    const list = rows
      .map(([k, label, hint, demo]) =>
        this.row(label, `<span class="two">${this.tog(k)}<button class="pb" data-a="try" data-v="${demo}" aria-label="Play ${label}">Play</button></span>`, hint),
      )
      .join("");
    return `<div class="px win" data-hit style="width:min(470px,92vw)">
<div class="wt"><span class="wl"><button class="pb" data-a="back" aria-label="Back">←</button>Sound</span><button class="pb" data-a="close" aria-label="Close">×</button></div>
<div class="wb">
${this.row("All sound", this.tog("sound"))}
${this.row("Volume", this.sld("volume", 0, 1, 0.05))}
<div class="h4">Sounds</div>
${list}
<div class="acts"><button class="pb" data-a="mile">Play a milestone</button><button class="pb" data-a="achtest">Play an achievement</button><button class="pb" data-a="inst">Back to settings</button></div>
</div></div>`;
  }

  private achievementsHtml(): string {
    const s = getStats();
    const acc = s.throws ? Math.round((s.goals / s.throws) * 100) : 0;
    const done = ACHIEVEMENTS.filter((a) => s.unlocked[a.id]).length;
    const stat = (label: string, v: string): string => `<div class="stat"><b>${v}</b><span>${label}</span></div>`;
    const rows = ACHIEVEMENTS.map((a) => {
      const [cur, max] = a.progress(s);
      const got = !!s.unlocked[a.id];
      return `<div class="row ach${got ? " done" : ""}"><div><div class="lb">${got ? "[x] " : "[ ] "}${a.name}</div><div class="hn">${a.desc}</div></div><span class="val">${got ? "Done" : `${cur} / ${max}`}</span></div>`;
    }).join("");
    return `<div class="px win" data-hit style="width:min(470px,92vw)">
<div class="wt"><span class="wl"><button class="pb" data-a="back" aria-label="Back">←</button>Achievements ${done}/${ACHIEVEMENTS.length}</span><button class="pb" data-a="close" aria-label="Close">×</button></div>
<div class="wb">
<div class="stats">${stat("Shots", String(s.throws))}${stat("Goals", String(s.goals))}${stat("Accuracy", acc + " %")}${stat("Best streak", String(s.bestStreak))}</div>
${rows}
</div></div>`;
  }

  private onboardingHtml(): string {
    const s = this.step;
    const dots = `<div class="dots">${[0, 1, 2, 3].map((i) => `<i class="${i <= s ? "on" : ""}"></i>`).join("")}</div>`;
    let body = "";
    if (s === 0) {
      body = `<h3>Welcome to Hoops</h3><p>A tiny basketball that lives at the bottom of your screen.</p><ul class="how"><li>Drag the ball and let go to shoot</li><li>Sink it for points and confetti</li><li>Hold Shift and drag to move the ball</li><li>Right-click the ball for the menu</li></ul>`;
    } else if (s === 1) {
      body = `<h3>Start automatically?</h3><p>Hoops starts quietly in the background when you log in.</p><div class="tiles">${this.tile("autostart", 1, "Yes, start it for me", "Ready right after login")}${this.tile("autostart", 0, "No, I will start it", "Open Hoops whenever you want")}</div>`;
    } else if (s === 2) {
      body = `<h3>Over other apps?</h3><p>Should the ball show over fullscreen apps, like games and video?</p><div class="tiles">${this.tile("fullscreen", 1, "On top of everything", "Even fullscreen")}${this.tile("fullscreen", 0, "Regular windows only", "Hidden behind fullscreen")}</div>`;
    } else {
      body = `<h3>All set</h3><p>You can change everything later in settings. Lost the ball? Press the shortcut to open the menu.</p>${SHORTCUT}`;
    }
    const nav = `<div class="nav"><div>${s > 0 ? '<button class="pb" data-a="back">Back</button>' : ""}</div><div>${
      s < 3
        ? '<button class="pb pri" data-a="next">Next</button>'
        : '<button class="pb pri" data-a="finish">Start playing</button>'
    }</div></div>`;
    return `<div class="px ob" data-hit style="width:min(430px,92vw)">${dots}${body}${nav}</div>`;
  }

  render(): void {
    this.syncBackKey();
    if (this.view !== "cosmetics") setPreviewOverride(null);
    let html = "";
    if (this.view === "menu") html = this.menuHtml();
    else if (this.view === "settings") html = this.settingsHtml();
    else if (this.view === "cosmetics") html = this.cosmeticsHtml();
    else if (this.view === "sound") html = this.soundHtml();
    else if (this.view === "achievements") html = this.achievementsHtml();
    else if (this.view === "leaderboard") html = this.leaderboardHtml();
    else if (this.view === "onboarding") html = this.onboardingHtml();
    if (this.view === "menu" || this.view === "settings" || this.view === "cosmetics" || this.view === "sound" || this.view === "achievements" || this.view === "leaderboard") {
      html = `<div class="catch" data-hit data-a="dismiss"></div>${html}`;
    }
    if (this.resetDialog) html += this.resetDialogHtml();
    if (this.premiumDialog) html += this.premiumDialogHtml();
    if (this.toastMsg) html += `<div class="px toast">${this.toastMsg}</div>`;
    this.host.innerHTML = html;
    const pv = this.host.querySelector<HTMLCanvasElement>("#prev");
    if (pv) new Preview(pv);
    this.game?.syncHit();
  }

  private onInput(e: Event): void {
    const t = e.target as HTMLInputElement;
    if (t.id === "lic") {
      this.licenseDraft = t.value;
      return;
    }
    const k = t.dataset.k;
    if (!k || t.type !== "range") return;
    const v = Number(t.value);
    setSetting(k as keyof Settings, v as never);
    const lab = this.host.querySelector<HTMLElement>(`[data-val="${k}"]`);
    if (lab) lab.textContent = fmt[k](v);
  }

  private onClick(e: MouseEvent): void {
    const t = (e.target as HTMLElement).closest<HTMLElement>("[data-a]");
    if (!t) return;
    const a = t.dataset.a;
    const k = t.dataset.k as keyof Settings | undefined;
    const v = t.dataset.v;
    if (a !== "dismiss") play("ui");
    switch (a) {
      case "dismiss":
        if (this.resetDialog || this.premiumDialog) {
          this.resetDialog = false;
          this.closePremium();
          this.render();
          break;
        }
        this.close();
        break;
      case "set":
        if (k) setSetting(k, (Number.isNaN(Number(v)) ? v : Number(v)) as never);
        if (k === "ballSkin" || k === "courtSkin" || k === "crowd") this.viewTheme = null;
        this.render();
        break;
      case "viewtheme":
        this.viewTheme = v as ThemeId;
        if (!isOwned(this.viewTheme)) {
          this.unlockTheme = this.viewTheme;
          this.premiumDialog = true;
        }
        this.render();
        break;
      case "usetheme":
        this.applyTheme(v as ThemeId);
        this.render();
        break;
      case "premium":
        this.unlockTheme = null;
        this.premiumDialog = true;
        this.render();
        break;
      case "themeunlock":
        this.unlockTheme = v as ThemeId;
        this.premiumDialog = true;
        this.render();
        break;
      case "buytheme": {
        const url = THEME_CHECKOUT_URLS[v as ThemeId];
        if (url) {
          void openExternal(url).catch(() => {
            window.open(url, "_blank", "noopener,noreferrer");
          });
        }
        break;
      }
      case "buypremium":
        void openExternal(PREMIUM_CHECKOUT_URL).catch(() => {
          window.open(PREMIUM_CHECKOUT_URL, "_blank", "noopener,noreferrer");
        });
        break;
      case "haskey":
        this.licenseStep = true;
        this.licenseError = "";
        this.render();
        void focusWindow().catch(() => {});
        this.host.querySelector<HTMLInputElement>("#lic")?.focus();
        break;
      case "activate":
        void this.activate();
        break;
      case "licback":
        this.licenseStep = false;
        this.licenseError = "";
        this.render();
        break;
      case "resetpremium":
        resetPurchases();
        this.toast("All Access locked again");
        break;
      case "notnow":
        this.closePremium();
        this.render();
        break;
      case "tog":
        if (k) setSetting(k, !settings[k] as never);
        this.render();
        break;
      case "opt":
        if (k) setSetting(k, (v === "1") as never);
        this.render();
        break;
      case "inst":
        this.openSettings();
        break;
      case "ach":
        this.openAchievements();
        break;
      case "snd":
        this.openSound();
        break;
      case "mile":
        this.game.previewMilestone();
        break;
      case "firetest":
        this.game.previewFire();
        break;
      case "achtest":
        this.game.previewAchievement();
        break;
      case "try":
        if (v === "achievement") this.game.previewAchievement();
        else if (v) play(v as Sfx);
        break;
      case "cos":
        this.openCosmetics();
        break;
      case "donatestats": {
        const s = donateStats();
        this.toast(`Donate test: button ${rate(s.button.views, s.button.clicks)}, footer ${rate(s.footer.views, s.footer.clicks)}`, 3200);
        break;
      }
      case "donate": {
        const variant = v === "footer" ? "footer" : "button";
        const stats = donateStats();
        stats[variant].clicks++;
        saveDonateStats(stats);
        void openExternal(DONATE_URL).catch(() => {
          window.open(DONATE_URL, "_blank", "noopener,noreferrer");
        });
        this.close();
        break;
      }
      case "back":
        this.back();
        break;
      case "lb":
        this.openLeaderboard();
        break;
      case "lbtab":
        this.lbTab = v as LbTab;
        this.render();
        void this.loadBoard();
        break;
      case "signin":
        void this.signInWith(v as LbProviderId);
        break;
      case "signout":
        void backend.signOut().then(() => {
          this.lbBoards = {};
          this.render();
          void this.loadBoard();
        });
        break;
      case "lbskip":
        this.lbSkip = true;
        try {
          localStorage.setItem("hoops.lb.skip", "1");
        } catch {
          /* ignore */
        }
        this.render();
        break;
      case "update":
        if (this.update) {
          const url = this.update.url;
          void openExternal(url).catch(() => {
            window.open(url, "_blank", "noopener,noreferrer");
          });
          this.close();
        }
        break;
      case "close":
        this.close();
        break;
      case "next":
        this.step = Math.min(3, this.step + 1);
        this.render();
        break;
      case "back":
        this.step = Math.max(0, this.step - 1);
        this.render();
        break;
      case "finish":
        setOnboarded();
        this.close();
        break;
      case "reset":
        this.resetDialog = true;
        this.render();
        break;
      case "cancelreset":
        this.resetDialog = false;
        this.render();
        break;
      case "confirmreset":
        this.resetDialog = false;
        this.game.resetScore();
        this.toast("Score reset");
        break;
      case "quit":
        void quitApp();
        break;
    }
  }
}
