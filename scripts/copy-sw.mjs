/**
 * Пост-обработка сборки.
 *
 * 1) Nitro-артефакт живёт в `.output` (сервер + статика) — это то, что
 *    запускается на VDS.
 * 2) Проверка артефактов в облачном превью ожидает классический каталог
 *    `dist/client`, поэтому зеркалим туда собранную статику, включая
 *    service worker. Без этого шага сборка падает на dist-check.
 */
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";

const from = ".output/public";
const to = "dist/client";

if (!existsSync(from)) {
  console.log("[postbuild] нет .output/public — пропускаем");
  process.exit(0);
}

rmSync(to, { recursive: true, force: true });
mkdirSync(to, { recursive: true });
cpSync(from, to, { recursive: true });
console.log(`[postbuild] статика скопирована: ${from} → ${to}`);
