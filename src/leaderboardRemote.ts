import { getStats } from "./stats";
import { getBestScore } from "./settings";
import {
  leaderboardLoad,
  leaderboardSignIn,
  leaderboardSignOut,
  leaderboardSubmitScore,
  leaderboardUser,
} from "./ipc";
import type { LbBackend, LbBoard, LbProviderId, LbTab, LbUser } from "./leaderboard";

const SYNC_MS = 30_000;

class RemoteLeaderboard implements LbBackend {
  available = true;
  private me: LbUser | null = null;
  private lastSync = 0;
  private syncing = false;

  constructor(private serverUrl: string) {
    void this.refreshUser();
  }

  user(): LbUser | null {
    return this.me;
  }

  async refreshUser(): Promise<void> {
    try {
      this.me = await leaderboardUser(this.serverUrl);
    } catch {
      this.me = null;
    }
  }

  async signIn(provider: LbProviderId): Promise<LbUser> {
    this.me = await leaderboardSignIn(this.serverUrl, provider);
    void this.submitScore(true);
    return this.me;
  }

  async signOut(): Promise<void> {
    await leaderboardSignOut();
    this.me = null;
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
    void leaderboardSubmitScore(this.serverUrl, getBestScore(), stats.bestStreak, stats.throws, stats.goals)
      .catch(() => {
        /* offline play should never care */
      })
      .finally(() => {
        this.syncing = false;
      });
  }
}

export function createRemoteLeaderboard(serverUrl: string): RemoteLeaderboard {
  return new RemoteLeaderboard(serverUrl);
}
