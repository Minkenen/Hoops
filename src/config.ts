// Places to change before shipping.

/**
 * Where "Buy Premium" sends people. Replace with the Lemon Squeezy checkout link of the product
 * (Lemon Squeezy dashboard, Products, Share), or set VITE_PREMIUM_URL when building.
 */
export const PREMIUM_CHECKOUT_URL: string =
  (import.meta.env.VITE_PREMIUM_URL as string | undefined) ?? "https://hoops.lemonsqueezy.com/buy/2234621";
