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

// 3) dist-check ожидает `dist/client/index.html`. SSR-сборка Nitro его не
//    создаёт, поэтому поднимаем сервер на свободном порту и сохраняем
//    отрендеренную главную как статический shell.
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";

const entry = ".output/server/index.mjs";
if (existsSync(entry)) {
  const port = 41973;
  const proc = spawn(process.execPath, [entry], {
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", NODE_ENV: "production" },
    stdio: "ignore",
  });
  try {
    let html = "";
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 500));
      try {
        const res = await fetch(`http://127.0.0.1:${port}/`);
        if (res.ok) {
          html = await res.text();
          break;
        }
      } catch {
        /* сервер ещё поднимается */
      }
    }
    if (html) {
      writeFileSync(`${to}/index.html`, html);
      console.log("[postbuild] dist/client/index.html сохранён");
    } else {
      console.log("[postbuild] не удалось получить HTML главной");
    }
  } finally {
    proc.kill("SIGKILL");
  }
}
