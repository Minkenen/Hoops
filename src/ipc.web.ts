// Browser version of ipc.ts: one "monitor" the size of the page, no native windows, no keychain.
import type { LbBoard, LbProviderId, LbTab, LbUser } from "./leaderboard";
import type { Handoff, LicenseActivation, MonitorInfo, Rect } from "./ipc";

export type { Handoff, LicenseActivation, MonitorInfo, Rect };

const nope = (): Promise<never> => Promise.reject(new Error("Not available in the browser version."));

export const getMonitors = async (): Promise<MonitorInfo[]> => [
  { index: 0, label: "overlay-0", x: 0, y: 0, w: window.innerWidth, h: window.innerHeight, scale: 1, bottom_inset: 0 },
];
export const setHitRegions = async (_rects: Rect[]): Promise<void> => {};
export const setCapture = async (_on: boolean): Promise<void> => {};
export const activateOverlay = async (_label: string): Promise<void> => {};
export const setOverFullscreen = async (_on: boolean): Promise<void> => {};
export const openExternal = async (url: string): Promise<void> => {
  window.open(url, "_blank", "noopener");
};
export const activateLicense = nope as (key: string) => Promise<LicenseActivation>;
export const validateLicense = async (_key: string): Promise<boolean> => true;
export const leaderboardUser = async (_u: string): Promise<LbUser | null> => null;
export const leaderboardSignIn = nope as (u: string, p: LbProviderId) => Promise<LbUser>;
export const leaderboardSignOut = async (): Promise<void> => {};
export const leaderboardLoad = nope as (u: string, t: LbTab) => Promise<LbBoard>;
export const leaderboardSubmitScore = nope as (u: string, s: number, b: number, t: number, g: number) => Promise<void>;
export const leaderboardSetNickname = nope as (u: string, n: string) => Promise<LbUser>;
export const focusWindow = async (): Promise<void> => {};
export const quitApp = async (): Promise<void> => {};
export const sendHandoff = async (_l: string, _p: Handoff): Promise<void> => {};
export const onHandoff = async (_f: (p: Handoff) => void): Promise<() => void> => () => {};
export const onToggleMenu = async (_f: () => void): Promise<() => void> => () => {};
export const currentLabel = (): string => "overlay-0";
export const isWindowVisible = async (): Promise<boolean> => true;
export const onCursorInside = async (_f: (inside: boolean) => void): Promise<() => void> => () => {};
