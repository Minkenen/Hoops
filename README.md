# Hoops

A tiny basketball game that lives at the bottom of your screen. Drag the ball, aim with the arrow and shoot at the hoop. Built with Tauri 2 (Rust + TypeScript) for Mac and Windows.

## Run

```bash
npm install
npm run tauri dev
```

Requires Node and Rust (`rustup`).

## Play

- Drag the ball and let go to shoot. The arrow (or dots) shows the path.
- Hold Shift and drag to move or throw the ball.
- Right-click the ball for the menu. Shortcut: Ctrl+Option+Cmd+B (Mac) / Ctrl+Alt+Win+B (Windows).
- Change the ball, court, crowd and pole base under Appearance.

## Sounds

Put sound files in `src/assets/sounds/`. See the README there for file names.

## Optional Leaderboard Backend

Hoops uses Cloudflare Workers + D1 for the optional login and leaderboard. It is small, cheap, HTTPS by default, easy to deploy globally, and D1 is enough for the simple tables Hoops needs. The desktop app never contains OAuth client secrets or database/service keys: sign-in, score submission and board loading are done through Rust commands in `src-tauri/src/lib.rs`, and the session token is stored in the OS keychain.

The app only shows the leaderboard in release builds when both of these are set at build time:

```bash
VITE_LEADERBOARD=1
VITE_LEADERBOARD_URL=https://your-worker.example
```

Local UI mock data is opt-in only:

```bash
VITE_LEADERBOARD_MOCK=1 npm run tauri dev
```

The Worker lives in `server/leaderboard/`:

```bash
cd server/leaderboard
wrangler d1 execute hoops-leaderboard --file schema.sql
wrangler deploy
```

Create these Cloudflare Worker secrets and variables; do not commit their values:

- `GOOGLE_CLIENT_ID`: Google OAuth desktop/web client id configured for the Worker callback URL.
- `GOOGLE_CLIENT_SECRET`: Google OAuth client secret.
- `APPLE_CLIENT_ID`: Apple Sign in Service ID.
- `APPLE_CLIENT_SECRET`: Apple client secret JWT for that Service ID.
- `SESSION_SECRET`: long random string for signing app sessions.
- `HASH_PEPPER`: long random string used when hashing provider user ids.
- `VITE_LEADERBOARD_URL`: app build env var pointing to the deployed Worker URL.
- `VITE_LEADERBOARD=1`: app build env var that enables the menu line in release builds.

OAuth callback URL for both Apple and Google:

```text
https://your-worker.example/auth/callback
```

Manual test checklist:

- Build with `VITE_LEADERBOARD=1` and `VITE_LEADERBOARD_URL` set.
- Open Hoops, choose `Leaderboard…`, and sign in with Google.
- Confirm the browser returns to Hoops and the leaderboard shows the nickname.
- Score a basket, wait up to 30 seconds, reload the board, and confirm the score appears.
- Quit and reopen Hoops; the session should still be present from the OS keychain.
- Sign out; the board should still load but the `you` row disappears.
- Turn Wi-Fi off and keep playing; scoring should still work locally without errors.
