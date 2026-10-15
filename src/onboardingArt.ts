// The small looping pictures of the onboarding steps (plain HTML and CSS, no files): a shot with the joystick, logging in, a video in fullscreen,
// two players in a room, the leaderboard, the shortcut. They are drawn by the rules in the `.od` part of ui.css.

import welcomeClip from "./assets/welcome.mp4?url";

/** Welcome: a real recording of the game, the ball is pulled back, flies into the hoop and scores. */
export function shotDemo(): string {
  return `<div class="od od-clip"><video src="${welcomeClip}" autoplay loop muted playsinline disablepictureinpicture></video></div>`;
}

/** Start automatically: the computer logs in and the ball is already there. */
export function autostartDemo(): string {
  return `<div class="od od-login"><div class="od-bar"><span>File</span><span>Edit</span><span>View</span></div><span class="od-ico"></span><div class="od-lock">Log in<b>Welcome back</b></div><div class="od-ball2"></div><span class="od-say">Ready right after login</span></div>`;
}

/** Over other apps: the ball over a fullscreen video, and hidden behind it. */
export function fullscreenDemo(): string {
  const cell = (cls: string, caption: string): string =>
    `<div class="od-cell${cls}"><div class="od-vid"></div><span class="od-play"></span><span class="od-prog"><i></i></span><span class="od-vball"></span><span class="od-cap">${caption}</span></div>`;
  return `<div class="od od-two">${cell("", "On top of everything")}${cell(" od-hide", "Regular windows only")}</div>`;
}

/** Play online: a code is shared, two players get ready. */
export function onlineDemo(): string {
  return `<div class="od od-room"><div class="od-pc od-a"><div class="od-pgr"></div><span class="od-nm">You</span><span class="od-bl"></span><span class="od-rd">Ready</span></div><div class="od-link"></div><div class="od-vs">VS</div><div class="od-pc od-b"><div class="od-pgr"></div><span class="od-nm">Friend</span><span class="od-bl"></span><span class="od-rd">Ready</span></div><div class="od-code">YSC-R2W</div></div>`;
}

/** The leaderboard: a new name climbs up the board (made-up players and scores). */
export function boardDemo(): string {
  const sw = (a: string, b: string): string => `<span class="od-sw"><i class="od-s1">${a}</i><i class="od-s2">${b}</i></span>`;
  const row = (cls: string, rank: string, c: string, name: string, score: string): string => `<div class="od-rw ${cls}">${rank}<span class="od-dot" style="background:${c}"></span>${name}<b>${score}</b></div>`;
  return `<div class="od od-board">${row("od-r1", "<span>1</span>", "#a24ad9", "PixelPro", "480")}${row("od-r2", "<span>2</span>", "#8a8e96", "HoopHero", "320")}${row("od-r3", sw("3", "4"), "#3a8bd9", "NetNinja", "120")}${row("od-r4", sw("4", "5"), "#3ab36a", "RimRider", "95")}${row("od-me", sw("5", "3"), "#ee7a24", `<span class="od-name">Your name</span>`, "150")}</div>`;
}

/** All set: the shortcut is pressed and the menu comes up. `keys` are the keys of the shortcut. */
export function allSetDemo(keys: string[]): string {
  const k = keys.map((key, i) => `${i ? "<span>+</span>" : ""}<span class="od-k">${key}</span>`).join("");
  return `<div class="od od-keys"><span class="od-lost">Lost the ball?</span><div class="od-krow">${k}</div><div class="od-menu"><i></i><i></i><i></i><i></i></div><div class="od-ball3"></div></div>`;
}
