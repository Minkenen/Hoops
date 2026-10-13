import type { ThemeId } from "./themes";

// Places to change before shipping.

/** The invite link of the Hoops Discord server (Discord: Invite people, make it never expire). Empty until the server exists: the button then says it is coming soon. */
export const DISCORD_URL: string = ((import.meta.env.VITE_DISCORD_URL as string | undefined) ?? "").trim();

/**
 * Where "Buy All Access" sends people. Replace with the Lemon Squeezy checkout link of the product
 * (Lemon Squeezy dashboard, Products, Share), or set VITE_PREMIUM_URL when building.
 */
export const PREMIUM_CHECKOUT_URL: string =
  (import.meta.env.VITE_PREMIUM_URL as string | undefined) ??
  "https://hoops.lemonsqueezy.com/checkout/buy/b923b7e7-c077-47f3-8cff-0a83eb86f823";

/**
 * Checkout links for buying one paid theme. Fill these after creating each Lemon Squeezy product,
 * or pass them as VITE_THEME_*_URL when building.
 */
export const THEME_CHECKOUT_URLS: Partial<Record<ThemeId, string>> = {
  street: (import.meta.env.VITE_THEME_STREET_URL as string | undefined) ??
    "https://hoops.lemonsqueezy.com/checkout/buy/585a0c43-729e-4268-b7e8-530c86ab72db",
  arena: (import.meta.env.VITE_THEME_ARENA_URL as string | undefined) ??
    "https://hoops.lemonsqueezy.com/checkout/buy/60a540dc-2b71-48b1-9339-eac3bfe9acc1",
  led: (import.meta.env.VITE_THEME_LED_URL as string | undefined) ??
    "https://hoops.lemonsqueezy.com/checkout/buy/a1330903-22b6-4ae9-83fa-43ce4fc2c7ae",
  "train-day": (import.meta.env.VITE_THEME_TRAIN_DAY_URL as string | undefined) ??
    "https://hoops.lemonsqueezy.com/checkout/buy/f45143ed-d26c-4878-9cb6-7d86df7c50be",
  "train-night": (import.meta.env.VITE_THEME_TRAIN_NIGHT_URL as string | undefined) ??
    "https://hoops.lemonsqueezy.com/checkout/buy/fca9d28a-80c5-453f-a81f-bf271c0ea67b",
  "train-canyon": (import.meta.env.VITE_THEME_TRAIN_CANYON_URL as string | undefined) ??
    "https://hoops.lemonsqueezy.com/checkout/buy/50e23fe4-b77c-49b9-be13-68317e38f0fd",
};
