// Browser version of ipc.ts: one "monitor" the size of the page, no native windows, no keychain.
import type { LbBoard, LbProviderId, LbTab, LbUser } from "./leaderboard";
import type { Handoff, LicenseActivation, MonitorInfo, Rect } from "./ipc";

export type { Handoff, LicenseActivation, MonitorInfo, Rect };


/** The phone's bottom safe area (home bar), in pixels. */
function safeBottom(): number {
  const el = document.createElement("div");
  el.style.cssText = "position:fixed;left:0;bottom:0;width:0;padding-bottom:env(safe-area-inset-bottom,0px);visibility:hidden";
  document.body.appendChild(el);
  const px = parseFloat(getComputedStyle(el).paddingBottom) || 0;
  el.remove();
  return px;
}

export const getMonitors = async (): Promise<MonitorInfo[]> => [
  { index: 0, label: "overlay-0", x: 0, y: 0, w: window.innerWidth, h: window.innerHeight, scale: 1, bottom_inset: safeBottom() },
];
export const setHitRegions = async (_rects: Rect[]): Promise<void> => {};
export const setCapture = async (_on: boolean): Promise<void> => {};
export const activateOverlay = async (_label: string): Promise<void> => {};
export const setOverFullscreen = async (_on: boolean): Promise<void> => {};
export const openExternal = async (url: string): Promise<void> => {
  window.open(url, "_blank", "noopener");
};
const SERVER = ((import.meta.env.VITE_LEADERBOARD_URL as string | undefined) ?? "").trim().replace(/\/$/, "");
const TOKEN_KEY = "hoops.lbtoken";
export const WEB_PLAY_URL = "https://minkenen.github.io/Hoops/play/";
export const RESUME_KEY = "hoops.onb.resume";

export const getToken = (): string => {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
};
export const setToken = (t: string): void => {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
};

async function api<T>(base: string, method: string, path: string, body?: unknown, keepalive = false): Promise<T> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(`${(base || SERVER).replace(/\/$/, "")}${path}`, {
      method,
      keepalive,
      headers: { accept: "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("Could not reach the server.");
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error || "The request failed.");
  return data as T;
}

export const activateLicense = (key: string, email: string): Promise<LicenseActivation> => api<LicenseActivation>("", "POST", "/license/activate", { key, email });
export const validateLicense = async (key: string): Promise<boolean> => (await api<{ valid: boolean }>("", "POST", "/license/validate", { key })).valid;
export const leaderboardUser = async (u: string): Promise<LbUser | null> => {
  if (!getToken()) return null;
  try {
    return (await api<{ user: LbUser }>(u, "GET", "/me")).user;
  } catch (e) {
    if (e instanceof Error && /sign in/i.test(e.message)) setToken("");
    return null;
  }
};
export const leaderboardSessionToken = async (): Promise<string | null> => getToken() || null;
/** Signing in leaves the page for Google and comes back to the play page with the session in the address (see main.ts). */
export const leaderboardSignIn = (u: string, provider: LbProviderId): Promise<LbUser> => {
  try {
    localStorage.setItem(RESUME_KEY, "1");
  } catch {
    /* ignore */
  }
  location.assign(`${u.replace(/\/$/, "")}/auth/start?provider=${provider}&redirect_uri=${encodeURIComponent(WEB_PLAY_URL)}`);
  return new Promise<LbUser>(() => {});
};
export const leaderboardSignOut = async (): Promise<void> => setToken("");
export const leaderboardLoad = (u: string, t: LbTab): Promise<LbBoard> => api<LbBoard>(u, "GET", `/leaderboard?tab=${t}`);
export const leaderboardSubmitScore = async (u: string, score: number, bestStreak: number, throws: number, goals: number): Promise<void> => {
  if (!getToken()) return;
  await api(u, "POST", "/score", { score, bestStreak, throws, goals });
};
export const leaderboardSetNickname = (u: string, nickname: string): Promise<LbUser> => api<LbUser>(u, "POST", "/nickname", { nickname });
export const leaderboardDeleteAccount = async (u: string): Promise<void> => {
  if (!getToken()) return;
  await api(u, "DELETE", "/account");
  setToken("");
};
export const profileGet = async (u: string): Promise<unknown> => (getToken() ? (await api<{ profile: unknown }>(u, "GET", "/profile")).profile : null);
export const profilePut = async (u: string, profile: unknown): Promise<void> => {
  if (!getToken()) return;
  await api(u, "PUT", "/profile", profile, true);
};
export const focusWindow = async (): Promise<void> => {};
export const quitApp = async (): Promise<void> => {};
export const sendHandoff = async (_l: string, _p: Handoff): Promise<void> => {};
export const onHandoff = async (_f: (p: Handoff) => void): Promise<() => void> => () => {};
export const onToggleMenu = async (_f: () => void): Promise<() => void> => () => {};
export const currentLabel = (): string => "overlay-0";
export const isWindowVisible = async (): Promise<boolean> => true;
export const onCursorInside = async (_f: (inside: boolean) => void): Promise<() => void> => () => {};

// Back from Google: the server put the session in the address after the #, take it and tidy the address.
if (location.hash.startsWith("#token=")) {
  setToken(location.hash.slice(7));
  history.replaceState(null, "", location.pathname + location.search);
}
