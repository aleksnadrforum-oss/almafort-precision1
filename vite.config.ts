/**
 * Чистый open-source конфиг для деплоя на собственный VDS.
 *
 * Никаких платформенных пакетов: только TanStack Start, React, Tailwind,
 * tsconfig-paths и Nitro с пресетом `node-server` (артефакт .output/server).
 */
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { VitePWA } from "vite-plugin-pwa";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Ассеты `*.asset.json` ссылаются на внешний CDN, который на собственном VDS
 * отдаёт 404. Все файлы продублированы в `public/media/`, поэтому подменяем
 * url на локальный ещё на этапе сборки.
 */
const localAssetsPlugin = {
  name: "almafort:local-media-assets",
  enforce: "pre" as const,
  load(id: string) {
    const file = id.split("?")[0] ?? "";
    if (!file.endsWith(".asset.json") || !existsSync(file)) return null;
    try {
      const json = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
      const name = String(json["original_filename"] ?? "");
      if (name) json["url"] = `/media/${name}`;
      return { code: `export default ${JSON.stringify(json)};`, moduleType: "js" };
    } catch {
      return null;
    }
  },
};

const srcDir = fileURLToPath(new URL("./src", import.meta.url));

// Vite/Rolldown может удалить декларацию __exportAll при tree-shaking тяжёлых
// графов реэкспортов (Three/pdfmake/xlsx), оставив обращения к ней в SSR-чанках.
const ssrOutput = {
  format: "es",
  interop: "auto",
  esModule: true,
  generatedCode: { constBindings: true, symbols: false },
  hoistTransitiveImports: false,
} as const;

export default defineConfig({
  server: { host: true, port: 8080, strictPort: true },
  resolve: {
    alias: { "@": srcDir },
    dedupe: ["react", "react-dom", "@tanstack/react-router", "@tanstack/react-store"],
  },
  build: {
    rollupOptions: { treeshake: false as const },
  },
  environments: {
    ssr: {
      build: {
        minify: false as const,
        rollupOptions: { treeshake: false as const, output: ssrOutput },
      },
    },
  },
  plugins: [
    localAssetsPlugin,
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart(),
    nitro({ preset: process.env["NITRO_PRESET"] || "node-server" }),
    viteReact(),
    VitePWA({
      strategies: "generateSW",
      registerType: "autoUpdate",
      injectRegister: null,
      filename: "sw.js",
      manifest: false,
      outDir: "dist/client",
      devOptions: { enabled: false },
      workbox: {
        globPatterns: ["**/*.{js,css,woff2,png,svg,webp,ico}"],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: null,
        navigateFallbackDenylist: [/^\/~oauth/, /^\/api\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            urlPattern: ({ request }: { request: Request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: {
              cacheName: "almafort-pages",
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
          {
            urlPattern: ({ request }: { request: Request }) =>
              ["style", "script", "worker", "font"].includes(request.destination),
            handler: "StaleWhileRevalidate",
            options: { cacheName: "almafort-assets" },
          },
          {
            urlPattern: ({ request }: { request: Request }) => request.destination === "image",
            handler: "CacheFirst",
            options: {
              cacheName: "almafort-images",
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
});
