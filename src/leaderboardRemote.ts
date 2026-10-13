import { getStats } from "./stats";
import { getBestScore } from "./settings";
import {
  leaderboardDeleteAccount,
  leaderboardLoad,
  leaderboardSignIn,
  leaderboardSetNickname,
  leaderboardSetColor,
  leaderboardSignOut,
  leaderboardSubmitScore,
  leaderboardUser,
} from "./ipc";
import { syncNow } from "./profileSync";
import { leaderboardSessionToken } from "./ipc";
import { replayPayload, resetReplay, setReplaySession } from "./replay";
import type { LbBackend, LbBoard, LbProviderId, LbTab, LbUser } from "./leaderboard";

const SYNC_MS = 30_000;

export class RemoteLeaderboard implements LbBackend {
  available = true;
  private me: LbUser | null = null;
  private lastSync = 0;
  private syncing = false;

  constructor(private serverUrl: string) {}

  user(): LbUser | null {
    return this.me;
  }

  get url(): string {
    return this.serverUrl;
  }

  async refreshUser(): Promise<void> {
    try {
      this.me = await leaderboardUser(this.serverUrl);
      if (this.me) await this.prepareReplaySession();
    } catch {
      this.me = null;
    }
  }

  async signIn(provider: LbProviderId): Promise<LbUser> {
    this.me = await leaderboardSignIn(this.serverUrl, provider);
    await this.prepareReplaySession();
    const me = this.me;
    void this.submitScore(true);
    void syncNow(this.serverUrl, me).then((changed) => changed && window.dispatchEvent(new Event("storage")));
    return this.me;
  }

  async deleteAccount(): Promise<void> {
    await leaderboardDeleteAccount(this.serverUrl);
    try {
      localStorage.removeItem("hoops.sync");
    } catch {
      /* ignore */
    }
    this.me = null;
  }

  async signOut(): Promise<void> {
    await leaderboardSignOut();
    this.me = null;
  }

  async setNickname(name: string): Promise<LbUser> {
    this.me = await leaderboardSetNickname(this.serverUrl, name);
    return this.me;
  }

  async setColor(color: number): Promise<LbUser> {
    this.me = await leaderboardSetColor(this.serverUrl, color);
    return this.me;
  }

  async load(tab: LbTab): Promise<LbBoard> {
    return leaderboardLoad(this.serverUrl, tab);
  }

  submitScore(force = false): void {
    if (!this.me || this.syncing) return;
    const now = Date.now();
    if (!force && now - this.lastSync < SYNC_MS) return;
    this.lastSync = now;
    this.syncing = true;
    const stats = getStats();
    void this.submitReplay()
      .then((replaySessionId) => replaySessionId ? leaderboardSubmitScore(this.serverUrl, getBestScore(), stats.bestStreak, stats.throws, stats.goals, replaySessionId).then(() => { resetReplay(); return this.prepareReplaySession(); }) : undefined)
      .catch(() => {
        /* offline play should never care */
      })
      .finally(() => {
        this.syncing = false;
      });
  }

  private async submitReplay(): Promise<string | null> {
    const payload = replayPayload(__APP_VERSION__);
    const token = await leaderboardSessionToken();
    if (!payload || !token) return null;
    const response = await fetch(`${this.serverUrl}/replay`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
    if (!response.ok) return null;
    return payload.sessionId;
  }

  private async prepareReplaySession(): Promise<void> {
    const token = await leaderboardSessionToken();
    if (!token) return;
    const response = await fetch(`${this.serverUrl}/replay/session`, { method: "POST", headers: { authorization: `Bearer ${token}`, accept: "application/json" } });
    if (!response.ok) return;
    const data = await response.json() as { sessionId?: string; seed?: string };
    if (data.sessionId && data.seed) setReplaySession(data.sessionId, data.seed);
  }
}

export function createRemoteLeaderboard(serverUrl: string): RemoteLeaderboard {
  return new RemoteLeaderboard(serverUrl);
}
