/**
 * Копирует сгенерированный service worker в раздаваемую Nitro статику.
 * Без этого шага на VDS /sw.js отдаёт 404 (или HTML), браузер не может
 * обновить старого воркера, и Safari падает с «не удаётся произвести
 * анализ ответа» при навигации по сайту.
 */
import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

const from = "dist/client";
const to = ".output/public";

if (!existsSync(from)) {
  console.log("[copy-sw] нет dist/client — пропускаем");
  process.exit(0);
}
mkdirSync(to, { recursive: true });

const files = readdirSync(from).filter((f) => f === "sw.js" || /^workbox-.*\.js$/.test(f));
for (const f of files) {
  cpSync(join(from, f), join(to, f));
  console.log(`[copy-sw] ${f} → ${to}`);
}
if (files.length === 0) console.log("[copy-sw] service worker не найден");
