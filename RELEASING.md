# Releasing a new version of Hoops

1. Raise the version in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml` (they should match).
2. Build with the update signing key (the private key lives in `~/.hooperly-signing/updater.key`, never in the repo; keep a private backup of it, without it nobody can be updated). Mac:
   `TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.hooperly-signing/updater.key)" TAURI_SIGNING_PRIVATE_KEY_PASSWORD="" npm run tauri build`
   Besides the `.dmg` this makes `Hooperly.app.tar.gz` and its `.sig` (the signed update package). Windows: the workflow signs with the repository secrets `TAURI_SIGNING_PRIVATE_KEY` (the content of the key file) and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (empty). Mac, old text:
   Mac with `npm run tauri build` (use `RUSTFLAGS="--remap-path-prefix=$HOME=/build"` so no home folder path ends up in the app), Windows from the "Build Windows installer" workflow on GitHub.
3. Make a GitHub release (a new tag such as `v0.2.0`) and attach the installers. Keep the fixed names `Hoops-macOS.dmg` and `Hoops-Windows-setup.exe` so the download buttons on the website keep working.
4. Change `version` (and `notes`, the "What's new" lines shown in the menu) in `docs/version.json` and publish it in **both** places. The apps look at that file when they start and show an "Update available" button when their own version is older.
   - The public repo `Minkenen/Hooperly` (the website, `version.json` at its root): `https://minkenen.github.io/Hooperly/version.json`.
   - The small redirect repo `Minkenen/Hoops` (only `version.json`, `index.html`, `play/index.html`, `README.md`): `https://minkenen.github.io/Hoops/version.json`. Apps up to 0.1.24 still look here, and they only trust links under the old name, so keep `url` as `https://minkenen.github.io/Hoops/#download` and leave out `mac` and `windows` in this copy.
5. Check both addresses with `curl` and that the Windows and Mac download links answer 200.
6. Deploy the server (`wrangler deploy` in `server/leaderboard`) if it changed, after any new migrations, and before announcing the release.
7. The in-app update (apps from 0.1.25): put the signed packages on the release (`Hooperly.app.tar.gz` and its `.sig` for the Mac, the Windows `-setup.exe` and its `.sig`; give the Mac one a versioned name such as `Hooperly_0.1.25_aarch64.app.tar.gz`) and write `latest.json` with
   `node scripts/make-latest-json.mjs 0.1.25 notes.txt latest.json darwin-aarch64=<url>,<path to .sig> windows-x86_64=<url>,<path to .sig>`.
   Publish `latest.json` at the root of the website repo (`Minkenen/Hooperly`, next to `version.json`): the app asks `https://minkenen.github.io/Hooperly/latest.json`. The "Update available" button then downloads, installs and restarts the app by itself; if that fails it opens the download page.
   The first version with the updater (0.1.25) has to be installed by hand once; from then on updates install themselves.
