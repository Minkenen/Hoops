import { getScore } from "./settings";
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
import { hasReplaySession, replayBusy, replayPayload, replaySubmitting, resetReplay, setReplaySession } from "./replay";
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

  /** Sends the shots of this session and then the score. The score is only counted by the server together with a replay it has verified. */
  submitScore(force = false): void {
    if (!this.me || this.syncing) return;
    const now = Date.now();
    if (!force && now - this.lastSync < SYNC_MS) return;
    if (replayBusy()) {
      // a shot is in the air: wait until it is decided
      window.setTimeout(() => this.submitScore(force), 2500);
      return;
    }
    this.lastSync = now;
    this.syncing = true;
    void this.sync()
      .catch(() => {
        /* offline play should never care: the shots are kept and sent next time */
      })
      .finally(() => {
        this.syncing = false;
      });
  }

  private retryTimer = 0;
  private retryLater(): void {
    window.clearTimeout(this.retryTimer);
    this.retryTimer = window.setTimeout(() => this.submitScore(true), SYNC_MS + 5_000);
  }

  private async sync(): Promise<void> {
    if (!hasReplaySession()) {
      await this.prepareReplaySession();
      return;
    }
    const payload = replayPayload(__APP_VERSION__);
    if (!payload) return;
    replaySubmitting(true);
    try {
      const token = await leaderboardSessionToken();
      if (!token) return;
      const upload = await fetch(`${this.serverUrl}/replay`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
      if (!upload.ok) {
        // a server problem: keep the shots and try again; a refusal of this replay: start a new session
        if (upload.status >= 500 || upload.status === 429) this.retryLater();
        else await this.newSession();
        return;
      }
      const result = await leaderboardSubmitScore(this.serverUrl, getScore(), payload.sessionId);
      if (!result) return;
      if (result.verified) await this.newSession();
      else if (result.retryable) this.retryLater();
      else await this.newSession(); // the server will not count this replay: do not carry it around
    } finally {
      replaySubmitting(false);
    }
  }

  /** The shots are counted (or can never be): a new session starts, and the next hoop is built from its seed. */
  private async newSession(): Promise<void> {
    resetReplay();
    await this.prepareReplaySession();
  }

  async prepareReplaySession(): Promise<void> {
    const token = await leaderboardSessionToken();
    if (!token) return;
    const response = await fetch(`${this.serverUrl}/replay/session`, { method: "POST", headers: { authorization: `Bearer ${token}`, accept: "application/json" } });
    if (!response.ok) return;
    const data = (await response.json()) as { sessionId?: string; seed?: string };
    if (data.sessionId && data.seed) setReplaySession(data.sessionId, data.seed);
  }
}

export function createRemoteLeaderboard(serverUrl: string): RemoteLeaderboard {
  return new RemoteLeaderboard(serverUrl);
}
