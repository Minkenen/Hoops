// Lets Node import the game's TypeScript files, which import each other without file extensions ("./draw").
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export async function resolve(specifier, context, next) {
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && !/\.[a-z]+$/i.test(specifier) && context.parentURL) {
    const base = new URL(specifier, context.parentURL);
    for (const ext of [".ts", "/index.ts"]) {
      const url = base.href + ext;
      if (existsSync(fileURLToPath(url))) return next(url, context);
    }
  }
  return next(specifier, context);
}
