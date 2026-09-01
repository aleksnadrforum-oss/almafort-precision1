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
import { fileURLToPath } from "node:url";
import { mirrorDist } from "./scripts/dist-mirror.mjs";

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
    // Клиентский бандл должен парситься старыми iOS Safari (15+),
    // иначе на iPhone страница рендерится, но ни одна кнопка не работает.
    target: ["es2020", "safari15", "chrome87", "firefox78"],
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
    // dist-check в облаке запускает голый `vite build` и ждёт dist/client.
    {
      name: "almafort-dist-mirror",
      apply: "build" as const,
      closeBundle() {
        mirrorDist();
      },
      buildStart() {
        process.once("exit", () => {
          mirrorDist();
        });
      },
    },
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart(),
    nitro({ preset: process.env["NITRO_PRESET"] || "node-server" }),
    viteReact(),
  ],
});
