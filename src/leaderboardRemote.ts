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
import { type ReplayPayload, dropPending, hasReplaySession, pendingReplays, replayBusy, replayIdle, replayPayload, replaySubmitting, resetReplay, rotateReplay, setReplaySession } from "./replay";
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

  /** Sends what is waiting now and waits for it (up to 6 seconds): the leaderboard window calls it before it reads the board. */
  async flush(): Promise<void> {
    if (!this.me) return;
    const until = Date.now() + 6_000;
    while ((this.syncing || replayBusy()) && Date.now() < until) await new Promise((r) => window.setTimeout(r, 150));
    if (this.syncing || Date.now() >= until) return;
    this.syncing = true;
    this.lastSync = Date.now();
    try {
      await this.sync();
    } catch {
      /* the shots are kept and sent next time */
    } finally {
      this.syncing = false;
    }
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
  /** How many times in a row the server refused the same replay without keeping it. */
  private refusals = 0;
  private retryLater(): void {
    window.clearTimeout(this.retryTimer);
    this.retryTimer = window.setTimeout(() => this.submitScore(true), SYNC_MS + 5_000);
  }

  private async sync(): Promise<void> {
    const token = await leaderboardSessionToken();
    if (!token) return;
    // 1. shots that wait from earlier (a lost connection, a restart)
    for (const waiting of pendingReplays()) if (!(await this.deliver(waiting, token))) return;
    if (!hasReplaySession()) {
      await this.prepareReplaySession();
      return;
    }
    if (replayBusy() || !replayPayload(__APP_VERSION__)) return;
    // 2. the shots of now: wait until no hoop is up, then switch to a fresh session at once, so no shot is ever recorded in a gap
    for (let i = 0; i < 30 && !replayIdle(); i++) await new Promise((r) => window.setTimeout(r, 250));
    const fresh = await this.fetchSession(token);
    if (fresh) {
      const payload = rotateReplay(fresh.sessionId, fresh.seed, __APP_VERSION__);
      if (payload) await this.deliver(payload, token);
      return;
    }
    // no new session to be had: send the shots as they are and hold recording while they are on their way
    const payload = replayPayload(__APP_VERSION__);
    if (!payload) return;
    replaySubmitting(true);
    try {
      if (await this.deliver(payload, token)) {
        resetReplay();
        await this.prepareReplaySession();
      }
    } finally {
      replaySubmitting(false);
    }
  }

  /**
   * Sends one replay and then its score. Returns true when it is finished (counted, kept by the server, or can never be counted),
   * false when it must be tried again later. Anything not finished stays in the waiting list.
   */
  private async deliver(payload: ReplayPayload, token: string): Promise<boolean> {
    const upload = await fetch(`${this.serverUrl}/replay`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
    if (!upload.ok) {
      if (upload.status >= 500 || upload.status === 429) {
        this.retryLater();
        return false;
      }
      // The server keeps a replay it cannot count right now in its vault and counts it later (`kept`); only then is it let go here.
      const answer = (await upload.json().catch(() => ({}))) as { kept?: boolean; code?: string };
      if (answer.kept === true || answer.code === "bad_session" || answer.code === "session_used" || ++this.refusals > 4) {
        this.refusals = 0;
        dropPending(payload.sessionId);
        return true;
      }
      this.retryLater();
      return false;
    }
    const result = await leaderboardSubmitScore(this.serverUrl, getScore(), payload.sessionId);
    if (!result) return false;
    if (result.verified) {
      dropPending(payload.sessionId);
      return true;
    }
    if (result.retryable) {
      this.retryLater();
      return false;
    }
    // the server will not count it as a score now; it keeps a verified replay nobody claimed and counts it itself
    dropPending(payload.sessionId);
    return true;
  }

  private async fetchSession(token: string): Promise<{ sessionId: string; seed: string } | null> {
    try {
      const response = await fetch(`${this.serverUrl}/replay/session`, { method: "POST", headers: { authorization: `Bearer ${token}`, accept: "application/json" } });
      if (!response.ok) return null;
      const data = (await response.json()) as { sessionId?: string; seed?: string };
      return data.sessionId && data.seed ? { sessionId: data.sessionId, seed: data.seed } : null;
    } catch {
      return null;
    }
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
