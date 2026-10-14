// Looks for a newer version of Hooperly, so the menu can offer an update button. Nothing is downloaded or installed here:
// the button just opens the download.
import { getVersion } from "@tauri-apps/api/app";

const VERSION_URL = "https://minkenen.github.io/Hooperly/version.json";

export interface UpdateInfo {
  version: string;
  url: string;
  /** What the update contains, a few short lines. */
  notes: string[];
}

/** Is a newer than b? Compares 1.2.3 style numbers part by part. */
function newer(a: string, b: string): boolean {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

/** Only ever open our own pages from that file. */
const trusted = (u: unknown): u is string =>
  typeof u === "string" && /^https:\/\/(github\.com\/Minkenen\/(Hooperly|Hoops)\/|minkenen\.github\.io\/(Hooperly|Hoops)\/)/.test(u);

export type UpdateCheck = { kind: "new"; info: UpdateInfo } | { kind: "latest"; current: string } | { kind: "error" };

/** Looks for a newer version and says what happened: there is one, this is the latest, or the check could not be made. */
export async function checkForUpdateDetailed(): Promise<UpdateCheck> {
  try {
    const [current, res] = await Promise.all([getVersion(), fetch(`${VERSION_URL}?t=${Date.now()}`, { cache: "no-store" })]);
    if (!res.ok) return { kind: "error" };
    const j = (await res.json()) as { version?: unknown; url?: unknown; mac?: unknown; windows?: unknown; notes?: unknown };
    if (typeof j.version !== "string") return { kind: "error" };
    if (!newer(j.version, current)) return { kind: "latest", current };
    const mac = /Mac/i.test(navigator.platform);
    const url = [mac ? j.mac : j.windows, j.url].find(trusted);
    const notes = Array.isArray(j.notes) ? j.notes.filter((n): n is string => typeof n === "string").map((n) => n.slice(0, 110)).slice(0, 8) : [];
    return url ? { kind: "new", info: { version: j.version, url, notes } } : { kind: "error" };
  } catch {
    return { kind: "error" };
  }
}

/** Returns the newer version, or null when this is the latest or the check could not be made (offline, for instance). */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  const r = await checkForUpdateDetailed();
  return r.kind === "new" ? r.info : null;
}

/**
 * Downloads and installs the new version in place, then restarts the app (Tauri updater, signed packages from latest.json).
 * Returns false when it could not be done (no signed package for this system, offline ...): the caller then opens the download page.
 */
export async function installUpdate(onProgress: (percent: number | null) => void): Promise<boolean> {
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const found = await check();
    if (!found) return false;
    let total = 0;
    let done = 0;
    await found.downloadAndInstall((ev) => {
      if (ev.event === "Started") {
        total = ev.data.contentLength ?? 0;
        onProgress(total ? 0 : null);
      } else if (ev.event === "Progress") {
        done += ev.data.chunkLength;
        onProgress(total ? Math.min(100, Math.round((done / total) * 100)) : null);
      } else if (ev.event === "Finished") {
        onProgress(100);
      }
    });
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
    return true;
  } catch {
    return false;
  }
}
