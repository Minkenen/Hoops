import type { BaseSkin } from "./sprites";

export interface SkinInfo {
  id: BaseSkin;
  name: string;
  description: string;
}

export const BASE_SKINS: SkinInfo[] = [
  { id: "plate", name: "Steel plate", description: "Square foot with bolts and two gussets." },
  { id: "round", name: "Round foot", description: "Round base in three steps with glossy metal shading." },
  { id: "concrete", name: "Concrete block", description: "Low concrete base with a shiny steel sleeve around the pole." },
];

export type BallSkinId = "classic" | "blue" | "green" | "gold" | "night";
export interface BallSkin {
  id: BallSkinId;
  name: string;
  pal: [string, string, string]; // dark, mid, light
  seam: string;
}

export const BALL_SKINS: BallSkin[] = [
  { id: "classic", name: "Classic", pal: ["#b8451a", "#ee7a24", "#ffa94d"], seam: "#1c1c22" },
  { id: "blue", name: "Blue", pal: ["#1f4fb0", "#3b82f0", "#8ab8ff"], seam: "#1c1c22" },
  { id: "green", name: "Green", pal: ["#1d7a3a", "#34b45a", "#8be0a2"], seam: "#1c1c22" },
  { id: "gold", name: "Gold", pal: ["#a8791a", "#e8b92d", "#fff0a0"], seam: "#1c1c22" },
  { id: "night", name: "Night", pal: ["#2a2d38", "#4a4f5e", "#8a91a6"], seam: "#c9cfdd" },
];

export type CourtSkinId = "parquet" | "arena" | "blacktop" | "worn" | "concrete";
export interface CourtSkin {
  id: CourtSkinId;
  name: string;
  wood: [string, string];
  zone: [string, string];
  line: string;
  hi: string;
  slab: string;
  tex?: CourtTex; // outdoor surfaces: grain, cracks, wear instead of planks
}

export interface CourtTex {
  grain: string[];
  weights: number[];
  joints: boolean | "tiles";
  cracks: number;
  wear: number;
  puddle: boolean;
  patches: number;
  curb: boolean;
  edge: string;
}

export const COURT_SKINS: CourtSkin[] = [
  { id: "parquet", name: "Parquet", wood: ["#dca25a", "#e3ae66"], zone: ["#3a5493", "#344d8a"], line: "#fff6e4", hi: "#f0c887", slab: "#a06c34" },
  { id: "arena", name: "Arena", wood: ["#3b4058", "#434863"], zone: ["#e8731f", "#d96a1a"], line: "#f4f0ff", hi: "#5a6082", slab: "#23263a" },
  {
    id: "blacktop",
    name: "Blacktop",
    wood: ["#3b3e46", "#42454e"],
    zone: ["#2f6f9f", "#2a6591"],
    line: "#f2f2ec",
    hi: "#555a66",
    slab: "#5a5f6a",
    tex: { grain: ["#34373e", "#3b3e46", "#42454e", "#2d3036"], weights: [0.35, 0.4, 0.15, 0.1], joints: true, cracks: 0, wear: 0, puddle: false, patches: 0, curb: true, edge: "#9aa1ad" },
  },
  {
    id: "worn",
    name: "Worn street",
    wood: ["#6a6f78", "#7d828a"],
    zone: ["#a8483a", "#9b4033"],
    line: "#dedbd0",
    hi: "#8f949d",
    slab: "#4a4f5a",
    tex: { grain: ["#6a6f78", "#737880", "#7d828a", "#5e636c"], weights: [0.3, 0.35, 0.2, 0.15], joints: false, cracks: 9, wear: 0.3, puddle: true, patches: 4, curb: true, edge: "#8d929b" },
  },
  {
    id: "concrete",
    name: "Park concrete",
    wood: ["#b7b5ab", "#c4c2b7"],
    zone: ["#2f8a52", "#297a48"],
    line: "#ffffff",
    hi: "#d3d1c6",
    slab: "#8a897f",
    tex: { grain: ["#b7b5ab", "#bebcb1", "#c4c2b7", "#aeaca2"], weights: [0.3, 0.35, 0.2, 0.15], joints: "tiles", cracks: 3, wear: 0.12, puddle: false, patches: 0, curb: false, edge: "#6fc47e" },
  },];

export type CrowdStyle = "stands" | "arena" | "led" | "street" | "city" | "park" | "none";
export const CROWD_STYLES: { id: CrowdStyle; name: string; description: string }[] = [
  { id: "stands", name: "Crowd", description: "Six rows of fans that jump on goals" },
  { id: "arena", name: "Arena lights", description: "Dark arena with moving spotlights and a goal light show" },
  { id: "led", name: "LED board", description: "Scrolling text, silhouettes and flashes" },
  { id: "street", name: "Street fence", description: "Brick wall, graffiti and fans at a chain-link fence" },
  { id: "city", name: "Evening city", description: "Dusk skyline, lit windows and street lamps" },
  { id: "park", name: "Park", description: "Trees, clouds and fans on park benches" },
  { id: "none", name: "None", description: "Just the court" },
];
