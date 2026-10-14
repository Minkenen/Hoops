# Releasing a new version of Hoops

1. Raise the version in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml` (they should match).
2. Build: Mac with `npm run tauri build` (use `RUSTFLAGS="--remap-path-prefix=$HOME=/build"` so no home folder path ends up in the app), Windows from the "Build Windows installer" workflow on GitHub.
3. Make a GitHub release (a new tag such as `v0.2.0`) and attach the installers. Keep the fixed names `Hoops-macOS.dmg` and `Hoops-Windows-setup.exe` so the download buttons on the website keep working.
4. Change `version` (and `notes`, the "What's new" lines shown in the menu) in `docs/version.json` and publish it in **both** places. The apps look at that file when they start and show an "Update available" button when their own version is older.
   - The public repo `Minkenen/Hooperly` (the website, `version.json` at its root): `https://minkenen.github.io/Hooperly/version.json`.
   - The small redirect repo `Minkenen/Hoops` (only `version.json`, `index.html`, `play/index.html`, `README.md`): `https://minkenen.github.io/Hoops/version.json`. Apps up to 0.1.24 still look here, and they only trust links under the old name, so keep `url` as `https://minkenen.github.io/Hoops/#download` and leave out `mac` and `windows` in this copy.
5. Check both addresses with `curl` and that the Windows and Mac download links answer 200.
6. Deploy the server (`wrangler deploy` in `server/leaderboard`) if it changed, after any new migrations, and before announcing the release.
