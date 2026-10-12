// The leaderboard: what the menu window needs from a backend, and a make-believe backend for trying the design.
// The real backend (sign in with Google, scores kept on a server) plugs in through setBackend().

export type LbTab = "global" | "weekly" | "friends";
export type LbProviderId = "google";

export interface LbEntry {
  rank: number;
  name: string;
  score: number;
  /** Which little ball is drawn next to the name (a number, the window picks the colours). */
  icon: number;
}

export interface LbBoard {
  /** The best few players of this tab, best first. */
  top: LbEntry[];
  /** You on this tab (rank and score), or null when you are not on it (not signed in, or no score yet). */
  you: LbEntry | null;
  /** How many players there are on the board. */
  players: number;
  /** When the board was last updated, in ms since 1970. */
  updatedAt: number;
}

export interface LbUser {
  id: string;
  nickname: string;
}

export interface LbBackend {
  /** False when there is no server to talk to (the window then says the board is coming). */
  available: boolean;
  /** Who is signed in, or null. Synchronous: the backend keeps the session. */
  user(): LbUser | null;
  signIn(provider: LbProviderId): Promise<LbUser>;
  signOut(): Promise<void>;
  /** Changes your name on the board. Names are unique (no two players can have the same, whatever the capital letters). Rejects with a message to show, such as "That name is taken." */
  setNickname(name: string): Promise<LbUser>;
  load(tab: LbTab): Promise<LbBoard>;
}

/** Letters, numbers, spaces, - and _, up to 18 characters. Returns null when the name is not good enough (fewer than 3 characters). */
export function cleanNickname(v: string): string | null {
  const c = v.replace(/[^a-zA-Z0-9 _-]/g, "").replace(/\s+/g, " ").trim().slice(0, 18);
  return c.length >= 3 ? c : null;
}

/** The leaderboard is shown while trying the app out, and in a release only when it is switched on at build time (VITE_LEADERBOARD=1). */
export const LEADERBOARD_ON: boolean = import.meta.env.DEV || import.meta.env.VITE_LEADERBOARD === "1";

const NAMES = ["DunkMaster", "SwishQueen", "BallBot", "CourtKid", "NetNinja", "RimRider", "HoopHero", "AirMia"];
const FRIENDS = ["Mia", "Leo", "Sam", "Noa"];
const ME = "lb.mock.user";

/** Made-up players and sign-in, to look at the design. Nothing leaves the computer. */
const mock: LbBackend = {
  available: true,
  user: () => {
    try {
      return localStorage.getItem(ME) ? { id: "mock", nickname: localStorage.getItem(ME)! } : null;
    } catch {
      return null;
    }
  },
  async signIn() {
    try {
      localStorage.setItem(ME, "HoopsFan");
    } catch {
      /* ignore */
    }
    return { id: "mock", nickname: "HoopsFan" };
  },
  async setNickname(name) {
    const n = cleanNickname(name);
    if (!n) throw new Error("Use 3 to 18 letters, numbers, spaces, - or _.");
    if ([...NAMES, ...FRIENDS].some((x) => x.toLowerCase() === n.toLowerCase())) throw new Error("That name is taken. Try another.");
    try {
      localStorage.setItem(ME, n);
    } catch {
      /* ignore */
    }
    return { id: "mock", nickname: n };
  },
  async signOut() {
    try {
      localStorage.removeItem(ME);
    } catch {
      /* ignore */
    }
  },
  async load(tab) {
    await new Promise((r) => setTimeout(r, 250));
    const names = tab === "friends" ? FRIENDS : NAMES;
    const base = tab === "weekly" ? 290 : tab === "friends" ? 244 : 1204;
    const top = names.slice(0, 5).map((name, i) => ({ rank: i + 1, name, score: Math.round(base - i * (base / 14)), icon: i + 1 }));
    const you = mock.user() ? { rank: tab === "friends" ? top.length + 1 : tab === "weekly" ? 78 : 128, name: "You (HoopsFan)", score: tab === "weekly" ? 241 : 412, icon: 0 } : null;
    return { top, you, players: tab === "friends" ? 5 : 8412, updatedAt: Date.now() - 60000 };
  },
};

/** Used in a release when no server is connected: the window says the board is not open yet. */
const unavailable: LbBackend = {
  available: false,
  user: () => null,
  signIn: () => Promise.reject(new Error("The leaderboard is not open yet.")),
  signOut: () => Promise.resolve(),
  setNickname: () => Promise.reject(new Error("The leaderboard is not open yet.")),
  load: () => Promise.reject(new Error("The leaderboard is not open yet.")),
};

export let backend: LbBackend = import.meta.env.DEV ? mock : unavailable;

/** Connects a real backend. */
export function setBackend(b: LbBackend): void {
  backend = b;
}
