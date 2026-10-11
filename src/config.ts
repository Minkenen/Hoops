import type { ThemeId } from "./themes";

// Places to change before shipping.

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
  street: (import.meta.env.VITE_THEME_STREET_URL as string | undefined) ?? "",
  arena: (import.meta.env.VITE_THEME_ARENA_URL as string | undefined) ?? "",
  led: (import.meta.env.VITE_THEME_LED_URL as string | undefined) ?? "",
  "train-day": (import.meta.env.VITE_THEME_TRAIN_DAY_URL as string | undefined) ?? "",
  "train-night": (import.meta.env.VITE_THEME_TRAIN_NIGHT_URL as string | undefined) ?? "",
  "train-canyon": (import.meta.env.VITE_THEME_TRAIN_CANYON_URL as string | undefined) ?? "",
};
