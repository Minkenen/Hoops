import { defineConfig } from "vite";
// @ts-expect-error type error without @types/node package
import { readFileSync } from "node:fs";
const appVersion: string = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).version;
// @ts-expect-error type error without @types/node package
import process from "node:process";
const host = process.env.TAURI_DEV_HOST;
const web = process.env.VITE_TARGET === "web";
const stub = (f: string): string => new URL(`./src/web/${f}.ts`, import.meta.url).pathname;
const webIpc = new URL("./src/ipc.web.ts", import.meta.url).pathname;

// https://vite.dev/config/
export default defineConfig(() => ({
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
  base: web ? "./" : undefined,
  build: web ? { outDir: "docs/play", emptyOutDir: true } : undefined,
  resolve: web
    ? {
        alias: {
          "@tauri-apps/plugin-global-shortcut": stub("shortcut"),
          "@tauri-apps/plugin-autostart": stub("autostart"),
          "@tauri-apps/api/app": stub("app"),
        },
      }
    : undefined,
  plugins: web
    ? [
        {
          name: "fresh-page",
          transformIndexHtml: () => [
            {
              tag: "script",
              injectTo: "head-prepend" as const,
              children:
                '(function(){try{if(/[?&]v=\\d+/.test(location.search))return;var u=location.href.split("#")[0];fetch(u).then(function(a){return a.text()}).then(function(a){return fetch(u,{cache:"reload"}).then(function(r){return r.text()}).then(function(b){if(a!==b)location.replace(u+(u.indexOf("?")<0?"?":"&")+"v="+Date.now()+location.hash)})}).catch(function(){})}catch(e){}})()',
            },
          ],
        },
        {
          name: "web-ipc",
          enforce: "pre" as const,
          resolveId(id: string, importer?: string) {
            if (/\/ipc$/.test(id) && importer && !importer.includes("ipc.web")) return webIpc;
            return null;
          },
        },
      ]
    : [],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
