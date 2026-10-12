// Keeps your progress on your account, so it follows you between the browser and the app (and between computers).
// What is saved: stats and achievements, best score, looks and sound settings, and license keys.
// Not saved: things that belong to one computer (ball size, autostart, over-fullscreen, stay-open).
import { profileGet, profilePut, validateLicense } from "./ipc";
import type { LbUser } from "./leaderboard";
import { enforceOwned, setOwnedThemes } from "./purchases";
import { addLicense, getBestScore, getLicenses, reloadSettings, setPremiumUnlocked, setSetting, settings, type Settings, type StoredLicense } from "./settings";
import { getStats, type Stats } from "./stats";
import type { ThemeId } from "./themes";

const LOCAL_ONLY: (keyof Settings)[] = ["ballScale", "autostart", "fullscreen", "stayOpen"];
const SYNC_KEY = "hoops.sync";
const STATS_KEY = "hoops.stats";
const BEST_KEY = "hoops.best";

interface Profile {
  v: 1;
  best: number;
  stats: Stats;
  settings: Partial<Settings>;
  licenses: StoredLicense[];
}

interface SyncState {
  id: string;
  /** The profile exactly as we last sent or received it. */
  hash: string;
}

function readSync(): SyncState | null {
  try {
    return JSON.parse(localStorage.getItem(SYNC_KEY) ?? "null");
  } catch {
    return null;
  }
}

function writeSync(s: SyncState): void {
  try {
    localStorage.setItem(SYNC_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

function snapshot(): Profile {
  const sync: Partial<Settings> = { ...settings };
  for (const k of LOCAL_ONLY) delete sync[k];
  return { v: 1, best: getBestScore(), stats: getStats(), settings: sync, licenses: getLicenses() };
}

const hashOf = (p: Profile): string => JSON.stringify(p);

function mergeStats(a: Stats, b: Stats): Stats {
  const out: Stats = { ...a };
  for (const k of Object.keys(a) as (keyof Stats)[]) {
    if (k === "unlocked" || k === "streak") continue;
    (out[k] as number) = Math.max(Number(a[k]) || 0, Number(b[k]) || 0);
  }
  out.unlocked = { ...b.unlocked };
  for (const [id, t] of Object.entries(a.unlocked)) out.unlocked[id] = Math.min(t, b.unlocked[id] ?? t);
  return out;
}

/** Applies the licenses we hold to the unlocks, like the license recheck does. */
function applyLicenses(): void {
  const list = getLicenses();
  setPremiumUnlocked(list.some((l) => l.unlock === "all"));
  setOwnedThemes(list.filter((l) => l.unlock === "theme").map((l) => l.theme as ThemeId));
  enforceOwned();
}

/** Takes what the account has and mixes it with this computer. Returns true when something changed here. */
async function pull(serverUrl: string, user: LbUser): Promise<boolean> {
  const remote = (await profileGet(serverUrl)) as Partial<Profile> | null;
  const sync = readSync();
  const first = !sync || sync.id !== user.id;
  if (!remote || typeof remote !== "object") return false;
  const localBefore = hashOf(snapshot());
  const edited = !first && sync !== null && localBefore !== sync.hash;
  if (remote.stats && typeof remote.stats === "object") {
    const theirs: Stats = { ...getStats(), ...remote.stats, unlocked: { ...(remote.stats.unlocked ?? {}) } };
    localStorage.setItem(STATS_KEY, JSON.stringify(mergeStats(getStats(), theirs)));
  }
  localStorage.setItem(BEST_KEY, String(Math.max(getBestScore(), Number(remote.best) || 0)));
  if (remote.settings && typeof remote.settings === "object" && (first || !edited)) {
    reloadSettings();
    for (const [k, v] of Object.entries(remote.settings)) {
      if (!LOCAL_ONLY.includes(k as keyof Settings) && k in settings && (settings as unknown as Record<string, unknown>)[k] !== v) {
        setSetting(k as keyof Settings, v as never);
      }
    }
  }
  if (Array.isArray(remote.licenses)) {
    const have = new Set(getLicenses().map((l) => l.key));
    for (const l of remote.licenses) {
      if (!l || typeof l.key !== "string" || have.has(l.key)) continue;
      try {
        if (await validateLicense(l.key)) addLicense({ key: l.key, unlock: l.unlock === "all" ? "all" : "theme", theme: String(l.theme ?? "") });
      } catch {
        /* could not check it now: it comes with the next sync */
      }
    }
    applyLicenses();
  }
  return hashOf(snapshot()) !== localBefore;
}

async function push(serverUrl: string, user: LbUser): Promise<void> {
  const p = snapshot();
  const h = hashOf(p);
  const sync = readSync();
  if (sync?.hash === h && sync.id === user.id) return;
  await profilePut(serverUrl, p);
  writeSync({ id: user.id, hash: h });
}

/** Starts keeping the profile in step with the account while someone is signed in. onChange runs when the account changed what is shown here. */
export function startProfileSync(serverUrl: string, getUser: () => LbUser | null, onChange: () => void): void {
  let busy = false;
  const run = async (doPull: boolean): Promise<void> => {
    const user = getUser();
    if (!user || busy) return;
    busy = true;
    try {
      if (doPull && (await pull(serverUrl, user))) onChange();
      await push(serverUrl, user);
    } catch {
      /* offline: try again next time */
    } finally {
      busy = false;
    }
  };
  void run(true);
  window.setInterval(() => void run(false), 20_000);
  const hide = (): void => {
    if (document.visibilityState === "hidden") void run(false);
  };
  document.addEventListener("visibilitychange", hide);
  window.addEventListener("pagehide", hide);
}

/** Pulls right now (after signing in) and returns whether anything changed here. */
export async function syncNow(serverUrl: string, user: LbUser): Promise<boolean> {
  const changed = await pull(serverUrl, user).catch(() => false);
  await push(serverUrl, user).catch(() => undefined);
  return changed;
}
