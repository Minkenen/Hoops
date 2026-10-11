// Themes: a ball, a court and a crowd that belong together. Three are free, the rest are bought.
import type { BallSkinId, CourtSkinId, CrowdStyle } from "./skins";

export type ThemeId = "gym" | "park" | "city" | "street" | "arena" | "led" | "train-day" | "train-night" | "train-canyon";

export interface Theme {
  id: ThemeId;
  name: string;
  /** null = free. */
  price: string | null;
  ball: BallSkinId;
  court: CourtSkinId;
  crowd: CrowdStyle;
}

export const PRICE = "$2.99";

export const THEMES: Theme[] = [
  { id: "gym", name: "Gym", price: null, ball: "classic", court: "parquet", crowd: "stands" },
  { id: "park", name: "Park", price: null, ball: "green", court: "concrete", crowd: "park" },
  { id: "city", name: "City night", price: null, ball: "blue", court: "blacktop", crowd: "city" },
  { id: "street", name: "Street", price: PRICE, ball: "classic", court: "worn", crowd: "street" },
  { id: "arena", name: "Arena", price: PRICE, ball: "night", court: "arena", crowd: "arena" },
  { id: "led", name: "LED board", price: PRICE, ball: "gold", court: "parquet", crowd: "led" },
  { id: "train-day", name: "Train: countryside", price: PRICE, ball: "classic", court: "roofday", crowd: "trainday" },
  { id: "train-night", name: "Train: night city", price: PRICE, ball: "night", court: "roofnight", crowd: "trainnight" },
  { id: "train-canyon", name: "Train: canyon", price: PRICE, ball: "gold", court: "roofcanyon", crowd: "traincanyon" },
];

export const themeById = (id: string): Theme => THEMES.find((t) => t.id === id) ?? THEMES[0];
