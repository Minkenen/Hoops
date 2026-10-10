import { type Sfx, play } from "./audio";
import type { Game } from "./game";
import { openExternal, type Rect, quitApp } from "./ipc";
import { getScore, setOnboarded, setSetting, settings } from "./settings";
import type { Settings } from "./settings";
import { Preview } from "./preview";
import { ACHIEVEMENTS, getStats } from "./stats";
import { BALL_SKINS, BASE_SKINS, COURT_SKINS, CROWD_STYLES } from "./skins";

type View = "none" | "menu" | "settings" | "cosmetics" | "sound" | "achievements" | "onboarding";
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
  private toastMsg = "";
  private game!: Game;
  private awayTimer = 0;
  private donateVariant: DonateVariant = "button";

  constructor(private host: HTMLElement) {
    host.addEventListener("click", (e) => this.onClick(e));
    host.addEventListener("input", (e) => this.onInput(e));
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
    this.view = "menu";
    this.render();
  }

  openSettings(): void {
    this.view = "settings";
    this.render();
  }

  openSound(): void {
    this.view = "sound";
    this.render();
  }

  openCosmetics(): void {
    this.view = "cosmetics";
    this.render();
  }

  openOnboarding(): void {
    this.view = "onboarding";
    this.step = 0;
    this.render();
  }

  close(): void {
    this.view = "none";
    this.resetDialog = false;
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
    this.view = "achievements";
    this.render();
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
${this.row("Aim line", this.seg("arrow", [["arrow", "Arrow"], ["dots", "Dotted"]]))}
${this.row("Sound", this.tog("sound"))}
${this.row("Ball size", this.seg("ballScale", [[2, "S"], [3, "M"], [4, "L"]]))}
<div class="hr"></div>
<button class="pb full" data-a="ach">Achievements…</button>
<button class="pb full" data-a="cos">Appearance…</button>
<button class="pb full" data-a="inst">Settings…</button>
${this.donateHtml()}
<button class="pb full danger" data-a="quit">Quit Hoops</button></div>`;
  }

  private settingsHtml(): string {
    return `<div class="px win" data-hit style="width:min(470px,92vw)">
<div class="wt"><span>Settings</span><button class="pb" data-a="close" aria-label="Close">×</button></div>
<div class="wb">
<div class="h4">Game</div>
${this.row("Keep the court open", this.tog("stayOpen"), "Click outside the ball or press Esc to close")}
${this.row("Line while aiming", this.seg("arrow", [["arrow", "Arrow"], ["dots", "Dotted"]]))}
${this.row("Confetti", this.sld("confetti", 0, 300, 10))}
${this.row("Score bubble", this.sld("bubble", 1, 5, 0.5), "How long it stays")}
${this.row("Sound", this.tog("sound"))}
${this.row("Volume", this.sld("volume", 0, 1, 0.05))}
<button class="pb full" data-a="snd" style="margin-top:6px">Advanced sound…</button>
<button class="pb full" data-a="mile">Play a milestone</button>
<button class="pb full" data-a="achtest">Play an achievement</button>
<div class="h4">Appearance</div>
${this.row("Ball size", this.seg("ballScale", [[2, "Small"], [3, "Medium"], [4, "Large"]]), "Visible on the ball right away")}
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

  private cosmeticsHtml(): string {
    const balls = BALL_SKINS.map((s) =>
      this.skinTile("ballSkin", s.id, s.name, `<i class="sw ball" style="background:radial-gradient(circle at 35% 30%,${s.pal[2]},${s.pal[1]} 55%,${s.pal[0]})"></i>`),
    ).join("");
    const courts = COURT_SKINS.map((s) =>
      this.skinTile("courtSkin", s.id, s.name, `<i class="sw plan" style="background:linear-gradient(90deg,${s.zone[0]} 0 38%,${s.wood[0]} 38% 69%,${s.wood[1]} 69%)"></i>`),
    ).join("");
    const crowds = CROWD_STYLES.map((s) => this.skinTile("crowd", s.id, s.name, "", s.description)).join("");
    const bases = BASE_SKINS.map((s) => this.skinTile("baseSkin", s.id, s.name, "")).join("");
    return `<div class="px win" data-hit style="width:min(520px,94vw)">
<div class="wt"><span>Appearance</span><button class="pb" data-a="close" aria-label="Close">×</button></div>
<div class="wb">
<canvas class="prev" id="prev" width="${Preview.W}" height="${Preview.H}" aria-label="Preview"></canvas><div class="hn" style="margin:4px 0 0">Click the preview to hear the crowd cheer</div>
<div class="h4">Ball</div><div class="tiles w">${balls}</div>
<div class="h4">Court</div>${this.row("Show court", this.tog("court"), "While aiming")}<div class="tiles w">${courts}</div>
<div class="h4">Crowd</div>${this.row("Fill the screen", this.tog("arenaFill"), "Crowd and arena reach the top")}<div class="tiles w">${crowds}</div>
<div class="h4">Pole base</div><div class="tiles w">${bases}</div>
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
<div class="wt"><span>Sound</span><button class="pb" data-a="close" aria-label="Close">×</button></div>
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
<div class="wt"><span>Achievements ${done}/${ACHIEVEMENTS.length}</span><button class="pb" data-a="close" aria-label="Close">×</button></div>
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
    let html = "";
    if (this.view === "menu") html = this.menuHtml();
    else if (this.view === "settings") html = this.settingsHtml();
    else if (this.view === "cosmetics") html = this.cosmeticsHtml();
    else if (this.view === "sound") html = this.soundHtml();
    else if (this.view === "achievements") html = this.achievementsHtml();
    else if (this.view === "onboarding") html = this.onboardingHtml();
    if (this.view === "menu" || this.view === "settings" || this.view === "cosmetics" || this.view === "sound" || this.view === "achievements") {
      html = `<div class="catch" data-hit data-a="dismiss"></div>${html}`;
    }
    if (this.resetDialog) html += this.resetDialogHtml();
    if (this.toastMsg) html += `<div class="px toast">${this.toastMsg}</div>`;
    this.host.innerHTML = html;
    const pv = this.host.querySelector<HTMLCanvasElement>("#prev");
    if (pv) new Preview(pv);
    this.game?.syncHit();
  }

  private onInput(e: Event): void {
    const t = e.target as HTMLInputElement;
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
        if (this.resetDialog) {
          this.resetDialog = false;
          this.render();
          break;
        }
        this.close();
        break;
      case "set":
        if (k) setSetting(k, (Number.isNaN(Number(v)) ? v : Number(v)) as never);
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
