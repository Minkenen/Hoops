# Releasing a new version of Hoops

1. Raise the version in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml` (they should match).
2. Build: Mac with `npm run tauri build` (use `RUSTFLAGS="--remap-path-prefix=$HOME=/build"` so no home folder path ends up in the app), Windows from the "Build Windows installer" workflow on GitHub.
3. Make a GitHub release (a new tag such as `v0.2.0`) and attach the installers. Keep the fixed names `Hoops-macOS.dmg` and `Hoops-Windows-setup.exe` so the download buttons on the website keep working.
4. Change `version` in `docs/version.json` to the new number and push to `main`. The apps look at that file when they start and show an "Update available" button when their own version is older.
