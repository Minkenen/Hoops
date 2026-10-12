import type { LbBackend } from "./leaderboard";

let submit: (() => void) | null = null;

export function connectLeaderboardScoreSync(backend: LbBackend): void {
  const maybe = backend as LbBackend & { submitScore?: () => void };
  submit = typeof maybe.submitScore === "function" ? () => maybe.submitScore?.() : null;
}

export function queueLeaderboardScoreSync(): void {
  submit?.();
}
