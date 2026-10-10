import { play } from "./audio";
import type { Game } from "./game";
import { type Rect, quitApp } from "./ipc";
import { getScore, setOnboarded, setSetting, settings } from "./settings";
import type { Settings } from "./settings";

type View = "none" | "menu" | "settings" | "onboarding";

const isMac = /Mac/i.test(navigator.platform);
const SHORTCUT = isMac
  ? "<span class=\"kb\">Ctrl+Option+Cmd+B</span>"
  : "<span class=\"kb\">Ctrl+Alt+Win+B</span>";

const fmt: Record<string, (v: number) => string> = {
  confetti: (v) => (v === 0 ? "Av" : String(v)),
  bubble: (v) => v.toFixed(1) + " s",
  volume: (v) => Math.round(v * 100) + " %",
};

export class UI {
  view: View = "none";
  private step = 0;
  private confirm = false;
  private toastMsg = "";
  private game!: Game;
  private awayTimer = 0;

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
    this.view = "menu";
    this.render();
  }

  openSettings(): void {
    this.view = "settings";
    this.render();
  }

  openOnboarding(): void {
    this.view = "onboarding";
    this.step = 0;
    this.render();
  }

  close(): void {
    this.view = "none";
    this.confirm = false;
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

  private toast(m: string): void {
    this.toastMsg = m;
    this.render();
    setTimeout(() => {
      this.toastMsg = "";
      this.render();
    }, 1800);
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
<div class="row" style="padding:2px 0"><span class="lb">Poäng</span><b class="score">${getScore()}</b></div><div class="hr"></div>
${this.row("Linje", this.seg("arrow", [["arrow", "Pil"], ["dots", "Prickad"]]))}
${this.row("Ljud", this.tog("sound"))}
${this.row("Boll", this.seg("ballScale", [[2, "S"], [3, "M"], [4, "L"]]))}
<div class="hr"></div>
<button class="pb full" data-a="inst">Inställningar…</button>
<button class="pb full" data-a="reset">${this.confirm ? "Säker? Klicka igen" : "Nollställ poäng"}</button>
<button class="pb full danger" data-a="quit">Avsluta Hoops</button></div>`;
  }

  private settingsHtml(): string {
    return `<div class="px win" data-hit style="width:min(470px,92vw)">
<div class="wt"><span>Inställningar</span><button class="pb" data-a="close" aria-label="Stäng">×</button></div>
<div class="wb">
<div class="h4">Spel</div>
${this.row("Linje vid dragning", this.seg("arrow", [["arrow", "Pil"], ["dots", "Prickad"]]))}
${this.row("Konfetti", this.sld("confetti", 0, 300, 10))}
${this.row("Poängbubbla", this.sld("bubble", 1, 5, 0.5), "Hur länge den syns")}
${this.row("Ljud", this.tog("sound"))}
${this.row("Volym", this.sld("volume", 0, 1, 0.05))}
<div class="h4">Utseende</div>
${this.row("Bollstorlek", this.seg("ballScale", [[2, "Liten"], [3, "Medel"], [4, "Stor"]]), "Syns direkt på bollen")}
<div class="h4">System</div>
${this.row("Starta automatiskt", this.tog("autostart"), "När datorn startar")}
${this.row("Över helskärmsappar", this.tog("fullscreen"), "Spel och video")}
${this.row("Genväg för meny", SHORTCUT)}
<div class="acts"><button class="pb" data-a="reset">${this.confirm ? "Säker? Klicka igen" : "Nollställ poäng"}</button><button class="pb danger" data-a="quit">Avsluta Hoops</button></div>
</div></div>`;
  }

  private onboardingHtml(): string {
    const s = this.step;
    const dots = `<div class="dots">${[0, 1, 2, 3].map((i) => `<i class="${i <= s ? "on" : ""}"></i>`).join("")}</div>`;
    let body = "";
    if (s === 0) {
      body = `<h3>Välkommen till Hoops</h3><p>En liten basketboll som bor längst ner på din skärm.</p><ul class="how"><li>Dra i bollen och släpp för att skjuta</li><li>Ner i korgen ger poäng och konfetti</li><li>Håll Shift och dra för att flytta bollen</li><li>Högerklicka på bollen för meny</li></ul>`;
    } else if (s === 1) {
      body = `<h3>Starta automatiskt?</h3><p>Hoops startar tyst i bakgrunden när du loggar in.</p><div class="tiles">${this.tile("autostart", 1, "Ja, starta själv", "Redo direkt efter inloggning")}${this.tile("autostart", 0, "Nej, jag startar själv", "Öppna Hoops när du vill")}</div>`;
    } else if (s === 2) {
      body = `<h3>Över andra appar?</h3><p>Ska bollen synas över helskärmsappar, som spel och video?</p><div class="tiles">${this.tile("fullscreen", 1, "Ovanpå allt", "Även helskärm")}${this.tile("fullscreen", 0, "Bara vanliga fönster", "Göms bakom helskärm")}</div>`;
    } else {
      body = `<h3>Allt klart</h3><p>Du kan ändra allt senare i inställningarna. Tappat bort bollen? Tryck genvägen för att öppna menyn.</p>${SHORTCUT}`;
    }
    const nav = `<div class="nav"><div>${s > 0 ? '<button class="pb" data-a="back">Tillbaka</button>' : ""}</div><div>${
      s < 3
        ? '<button class="pb pri" data-a="next">Nästa</button>'
        : '<button class="pb pri" data-a="finish">Börja spela</button>'
    }</div></div>`;
    return `<div class="px ob" data-hit style="width:min(430px,92vw)">${dots}${body}${nav}</div>`;
  }

  render(): void {
    let html = "";
    if (this.view === "menu") html = this.menuHtml();
    else if (this.view === "settings") html = this.settingsHtml();
    else if (this.view === "onboarding") html = this.onboardingHtml();
    if (this.toastMsg) html += `<div class="px toast">${this.toastMsg}</div>`;
    this.host.innerHTML = html;
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
        if (!this.confirm) {
          this.confirm = true;
          this.render();
          setTimeout(() => {
            if (this.confirm) {
              this.confirm = false;
              this.render();
            }
          }, 2500);
        } else {
          this.confirm = false;
          this.game.resetScore();
          this.toast("Poängen nollställd");
        }
        break;
      case "quit":
        void quitApp();
        break;
    }
  }
}
