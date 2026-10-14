# Anti-cheat status

This file is intentionally conservative. A point is `DONE` only when the
server, client, and tests support it. Otherwise it remains `NOT DONE`.

1. Shared physics module: `DONE` for deterministic free-flight. The client and
   Worker import `shared/physics.ts`, and `test/physics-differential.test.mjs`
   compares 2,000 deterministic shots including final position and velocity.
   Collision parity remains part of point 2.
2. Server physics matching the client: `NOT DONE`. Ring, net, ball-radius,
   and polygon collision golden tests are still missing.
3. Server-owned geometry: `NOT DONE`. Replay validation still receives some
   geometry from the client and only applies plausibility checks.
4. Replay-bound score totals: `DONE` for the lifetime-delta check. Server-
   derived score/streak calculation is `NOT DONE`.
5. New replay session and hoop: `NOT DONE`. A new session is fetched after
   submission, but the active hoop is not yet rebuilt from the new seed.
6. Server-selected starting player: `DONE` in source for the new protocol.
7. Server-owned multiplayer state: `PARTIAL`. Turn, score, letters, result,
   and match-over state are tracked in source; authoritative physics and
   server-clock flight timing are still missing.
8. Client protocol/error handling: `PARTIAL`. Protocol version 2 is defined,
   but the user-facing update message and complete `match_over` handling need
   the 0.1.24 client release.
9. Replay/session cleanup: `DONE` in source. Old rows are removed during
   session creation and open sessions are rate-limited per account.
10. Remaining client trust: `NOT DONE`. The client still supplies shot timing,
    initial velocity, and some geometry until shared physics is complete.

## Deployment note

Protocol-2 source changes must ship with the matching client. Do not deploy
the protocol-2 Worker alone while released clients are still on 0.1.23.
