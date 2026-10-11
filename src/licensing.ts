// Checks again, now and then, that the licenses on this computer are still good (a refunded purchase stops working).
import { validateLicense } from "./ipc";
import { enforceOwned, setOwnedThemes } from "./purchases";
import { getLicenses, removeLicense, setPremiumUnlocked } from "./settings";
import type { ThemeId } from "./themes";

/** Returns true if some license was gone and the unlocks were taken back. Offline or unclear answers change nothing. */
export async function recheckLicenses(): Promise<boolean> {
  const list = getLicenses();
  if (!list.length) return false;
  let changed = false;
  for (const l of list) {
    try {
      if (!(await validateLicense(l.key))) {
        removeLicense(l.key);
        changed = true;
      }
    } catch {
      /* the server could not be reached: keep what we have */
    }
  }
  if (changed) {
    const left = getLicenses();
    setPremiumUnlocked(left.some((l) => l.unlock === "all"));
    setOwnedThemes(left.filter((l) => l.unlock === "theme").map((l) => l.theme as ThemeId));
    enforceOwned();
  }
  return changed;
}
