// Writes latest.json, the file the app's updater reads: where each system's signed update package is, and its signature.
// Usage: node scripts/make-latest-json.mjs <version> <notes-file-or-"-"> <out> key=url,sigfile ...
//   key is a Tauri platform name (darwin-aarch64, windows-x86_64 ...), e.g.
//   darwin-aarch64=https://github.com/Minkenen/Hooperly/releases/download/v0.1.25/Hooperly_aarch64.app.tar.gz,path/to/Hooperly.app.tar.gz.sig
import { readFileSync, writeFileSync } from "node:fs";

const [version, notesArg, out, ...platforms] = process.argv.slice(2);
if (!version || !out || platforms.length === 0) {
  console.error("usage: make-latest-json.mjs <version> <notes-file|-> <out> key=url,sigfile ...");
  process.exit(1);
}
const notes = notesArg && notesArg !== "-" ? readFileSync(notesArg, "utf8").trim() : "";
const entries = {};
for (const p of platforms) {
  const eq = p.indexOf("=");
  const [url, sigFile] = p.slice(eq + 1).split(",");
  entries[p.slice(0, eq)] = { signature: readFileSync(sigFile, "utf8").trim(), url };
}
writeFileSync(out, JSON.stringify({ version, notes, pub_date: new Date().toISOString(), platforms: entries }, null, 2) + "\n");
console.log(`wrote ${out} for ${Object.keys(entries).join(", ")}`);
