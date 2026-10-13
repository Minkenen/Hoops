import { invoke } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { LbBoard, LbProviderId, LbTab, LbUser } from "./leaderboard";

export interface MonitorInfo {
  index: number;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  scale: number;
  bottom_inset: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Handoff {
  gx: number;
  gy: number;
  vx: number;
  vy: number;
  gs: number;
  t: number;
  postGoal: boolean;
  shot: boolean;
}

export const getMonitors = (): Promise<MonitorInfo[]> => invoke<MonitorInfo[]>("get_monitors");
export const setHitRegions = (rects: Rect[]): Promise<void> => invoke("set_hit_regions", { rects });
export const setCapture = (on: boolean): Promise<void> => invoke("set_capture", { on });
export const activateOverlay = (label: string): Promise<void> => invoke("activate_overlay", { label });
export const setOverFullscreen = (on: boolean): Promise<void> => invoke("set_over_fullscreen", { on });
export const openExternal = (url: string): Promise<void> => invoke("open_external", { url });
export interface LicenseActivation {
  instance_id: string;
  unlock: "all" | "theme";
  theme_id: string;
}
/** Checks a Lemon Squeezy license key with the license server (done in Rust, never from the page). Rejects with a message to show. */
export const activateLicense = (key: string, email: string): Promise<LicenseActivation> => invoke<LicenseActivation>("activate_license", { key, email });
/** Asks the license server if a key is still good. Resolves false when it is not; rejects when the server cannot be reached. */
export const validateLicense = (key: string): Promise<boolean> => invoke<boolean>("validate_license", { key });
export const leaderboardUser = (serverUrl: string): Promise<LbUser | null> => invoke<LbUser | null>("leaderboard_user", { serverUrl });
export const leaderboardSessionToken = (): Promise<string | null> => invoke<string | null>("leaderboard_session_token");
export const leaderboardSignIn = (serverUrl: string, provider: LbProviderId): Promise<LbUser> =>
  invoke<LbUser>("leaderboard_sign_in", { serverUrl, provider });
export const leaderboardSignOut = (): Promise<void> => invoke("leaderboard_sign_out");
export const leaderboardLoad = (serverUrl: string, tab: LbTab): Promise<LbBoard> => invoke<LbBoard>("leaderboard_load", { serverUrl, tab });
export const leaderboardSubmitScore = (serverUrl: string, score: number, bestStreak: number, throws: number, goals: number): Promise<void> =>
  invoke("leaderboard_submit_score", { serverUrl, score, bestStreak, throws, goals });
export const leaderboardSetNickname = (serverUrl: string, nickname: string): Promise<LbUser> =>
  invoke<LbUser>("leaderboard_set_nickname", { serverUrl, nickname });
export const leaderboardDeleteAccount = (serverUrl: string): Promise<void> => invoke("leaderboard_delete_account", { serverUrl });
/** The profile kept on the account (stats, best score, cosmetics, licenses), or null when none is saved yet. */
export const profileGet = (serverUrl: string): Promise<unknown> => invoke("leaderboard_profile_get", { serverUrl });
export const profilePut = (serverUrl: string, profile: unknown): Promise<void> => invoke("leaderboard_profile_put", { serverUrl, profile });
export const focusWindow = (): Promise<void> => getCurrentWindow().setFocus();
export const quitApp = (): Promise<void> => invoke("quit_app");

export const sendHandoff = (label: string, payload: Handoff): Promise<void> => emitTo(label, "handoff", payload);
export const onHandoff = (f: (p: Handoff) => void): Promise<() => void> =>
  listen<Handoff>("handoff", (e) => f(e.payload));
export const onToggleMenu = (f: () => void): Promise<() => void> => listen("toggle-menu", () => f());

export const currentLabel = (): string => getCurrentWindow().label;
export const isWindowVisible = (): Promise<boolean> => getCurrentWindow().isVisible();
export const onCursorInside = (f: (inside: boolean) => void): Promise<() => void> =>
  listen<boolean>("cursor-inside", (e) => f(e.payload));
