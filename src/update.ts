// Looks for a newer version of Hoops, so the menu can offer an update button. Nothing is downloaded or installed here:
// the button just opens the download.
import { getVersion } from "@tauri-apps/api/app";

const VERSION_URL = "https://minkenen.github.io/Hoops/version.json";

export interface UpdateInfo {
  version: string;
  url: string;
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
const trusted = (u: unknown): u is string => typeof u === "string" && /^https:\/\/(github\.com\/Minkenen\/|minkenen\.github\.io\/)/.test(u);

/** Returns the newer version, or null when this is the latest or the check could not be made (offline, for instance). */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  try {
    const [current, res] = await Promise.all([getVersion(), fetch(`${VERSION_URL}?t=${Date.now()}`, { cache: "no-store" })]);
    if (!res.ok) return null;
    const j = (await res.json()) as { version?: unknown; url?: unknown; mac?: unknown; windows?: unknown };
    if (typeof j.version !== "string" || !newer(j.version, current)) return null;
    const mac = /Mac/i.test(navigator.platform);
    const url = [mac ? j.mac : j.windows, j.url].find(trusted);
    return url ? { version: j.version, url } : null;
  } catch {
    return null;
  }
}
