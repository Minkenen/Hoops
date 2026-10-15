// The small looping pictures of the onboarding steps (plain HTML and CSS, no files): a shot with the joystick, logging in, a video in fullscreen,
// two players in a room, the leaderboard, the shortcut. They are drawn by the rules in the `.od` part of ui.css.

/** Welcome: the ball is pulled back with the joystick, flies into the hoop, goal. */
export function shotDemo(): string {
  return `<div class="od od-shot"><div class="od-gr"></div><div class="od-hoop"></div><div class="od-bd"></div><div class="od-rim"></div><div class="od-net"></div>
<span class="od-tip">Pull back, then let go</span><div class="od-base"></div><div class="od-ball"></div><div class="od-nub"></div><div class="od-goal">GOAL!</div>
<div class="od-cf"><i style="left:78%;top:40%;background:#ee7a24;--x:-30px;--y:30px"></i><i style="left:80%;top:38%;background:#f6c744;--x:26px;--y:34px"></i><i style="left:76%;top:42%;background:#5de06a;--x:-10px;--y:44px"></i><i style="left:82%;top:40%;background:#35d4ff;--x:36px;--y:20px"></i></div></div>`;
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

/** The leaderboard: a new name climbs up the board. */
export function boardDemo(): string {
  const row = (n: number, c: string, name: string, score: number): string => `<div class="od-rw od-r${n}"><span>${n}</span><span class="od-dot" style="background:${c}"></span>${name}<b>${score}</b></div>`;
  return `<div class="od od-board">${row(1, "#a24ad9", "Hoopsnr1", 702)}${row(2, "#8a8e96", "Beenana", 158)}${row(3, "#3a8bd9", "BobSvamp", 112)}${row(4, "#3ab36a", "Pontus", 103)}<div class="od-rw od-me"><span>?</span><span class="od-dot" style="background:#e8392b"></span><span class="od-name">Your name</span><b>0</b></div></div>`;
}

/** All set: the shortcut is pressed and the menu comes up. `keys` are the keys of the shortcut. */
export function allSetDemo(keys: string[]): string {
  const k = keys.map((key, i) => `${i ? "<span>+</span>" : ""}<span class="od-k">${key}</span>`).join("");
  return `<div class="od od-keys"><span class="od-lost">Lost the ball?</span><div class="od-krow">${k}</div><div class="od-menu"><i></i><i></i><i></i><i></i></div><div class="od-ball3"></div></div>`;
}
