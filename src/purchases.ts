// Which themes you own. Free themes are always owned, and Hoops All Access (one payment) unlocks every other theme.
import { clearLicenseKey, isPremiumUnlocked, setPremiumUnlocked, setSetting, settings } from "./settings";
import { THEMES, type ThemeId, themeById } from "./themes";

const KEY = "hoops.owned";

function bought(): ThemeId[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function isOwned(id: ThemeId): boolean {
  return themeById(id).price === null || isPremiumUnlocked() || bought().includes(id);
}

/** Dev/testing: forget every unlock, so the locked state can be tried again. */
export function resetPurchases(): void {
  setPremiumUnlocked(false);
  clearLicenseKey();
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  enforceOwned();
}

/** Ball, court and crowd you can pick one by one: the ones that come with a theme you own. */
export function isItemOwned(kind: "ball" | "court" | "crowd", id: string): boolean {
  if (kind === "crowd" && id === "none") return true;
  return THEMES.some((t) => isOwned(t.id) && t[kind] === id);
}

/** If the current look uses something you do not own, go back to the Gym theme. */
export function enforceOwned(): void {
  const gym = themeById("gym");
  if (!isItemOwned("ball", settings.ballSkin)) setSetting("ballSkin", gym.ball);
  if (!isItemOwned("court", settings.courtSkin)) setSetting("courtSkin", gym.court);
  if (!isItemOwned("crowd", settings.crowd)) setSetting("crowd", gym.crowd);
  if (!isOwned(settings.theme)) setSetting("theme", "gym");
}
