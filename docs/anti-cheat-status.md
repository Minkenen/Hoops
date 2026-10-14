# Anti-cheat status

Every line below is backed by a test (`npm test`, 112 tests) unless it says otherwise.

| # | Point | Status |
|---|-------|--------|
| T1 | One shared ball step and court placement (`shared/world.ts`, `shared/court.ts`) used by the game and the server | DONE. 500 shots compared frame by frame against a frozen copy of the old step; hoop placement compared on 1000 screens |
| T2 | Server takes no court data from the player; a replay shot that carries any is refused | DONE |
| T3 | Server replays every claimed goal; a goal counts only if the replay is a goal at about the same time; misses are never turned into goals | DONE (20 deliberate faults in the verifier were all caught by the tests) |
| T4 | Scores and counters come from the verified replay, not from the player | DONE (`/score` takes only session id, score, version; weekly gain cap; best score at most previous + replay goals) |
| T5 | New replay session after each submission; the hoop is rebuilt from the new seed | DONE |
| T6 | Server picks the starting player; hoops of a match come from the room seed | DONE |
| T7 | Server keeps the whole match (turn, shots, score, letters, winner, rest, forfeit) and plays every shot itself | DONE |
| T8 | App follows `match_state`, shows a clear message for an old protocol or a refused shot | DONE (protocol 3, `/mp/version`) |
| T9 | Cleanup of old replays and sessions (on session creation and hourly cron) | DONE |
| T10 | Remaining client-trusted inputs | see below |
| E | A license key belongs to the first account that uses it; Lemon Squeezy is asked at most once a day per key | DONE |

## End-to-end check

The real game was driven in a browser against a local worker: the app's own
physics produced shots, the server replayed them. 15 counted shots, 11 goals,
0 goals the server could not reproduce. (3 shots from a warm-up were voided
by the app, as designed.)

## What a cheater can still do (T10)

The server cannot see the player's hand, so these stay trusted within limits:

- The *hand*: start position, speed and spin of each shot. A program can aim
  perfectly (an aimbot) as long as every shot is a speed a real hand could make
  (`maxSpeed`). Defence: accuracy above 92 % over 30+ shots and perfectly even
  pace are flagged as suspicious.
- Window size and floor height, within fixed ranges.
- Which shots are marked void (multi-monitor handoff, swats, hero shots). Void
  shots count nothing, so this can only cost the player points.
- Timing between shots (at least 700 ms apart, at most 2 min).
- The net cloth is not replayed. Measured: goal outcomes agree in 248 of 248
  goals with and without it; timing differs by up to 3 ticks, inside the
  allowed margin.

## Deploying

The server (protocol 3), the 0.1.24 app and the rebuilt web client must go out
together; the old 0.1.23 app cannot talk to the new worker.

Migrations 0009 and 0010 were already applied by hand on the live database:
record them in `d1_migrations` instead of running them again. 0011 and 0012
are new.
