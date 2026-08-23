/**
 * PM2 конфигурация ALMAFORT для VPS (Reg.ru, Ubuntu 22.04/24.04).
 *
 * Запуск:
 *   pm2 start ecosystem.config.cjs --env production
 *   pm2 save && pm2 startup
 *
 * Переменные окружения читаются из файла .env в корне проекта
 * (см. блок загрузки ниже) и дополняются значениями из env_production.
 */

const fs = require("node:fs");
const path = require("node:path");

/** Минимальный парсер .env без внешних зависимостей. */
function loadEnvFile(file) {
  const full = path.resolve(__dirname, file);
  if (!fs.existsSync(full)) return {};
  const out = {};
  for (const rawLine of fs.readFileSync(full, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim().replace(/^export\s+/, "");
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

// .env — базовый, .env.production переопределяет его при наличии.
const fileEnv = { ...loadEnvFile(".env"), ...loadEnvFile(".env.production") };

module.exports = {
  apps: [
    {
      name: "almafort",
      // Nitro node-server кладёт сборку сюда (preset node-server).
      script: "./.output/server/index.mjs",
      cwd: __dirname,
      exec_mode: "cluster",
      // Жёстко 2 инстанса под 2-ядерный VPS. Не зависим от WEB_CONCURRENCY,
      // чтобы PM2 не создал лишних воркеров и не переполнил RAM.
      instances: 2,
      autorestart: true,
      watch: false,
      // Если воркер превысит 1 ГБ (тяжёлый PDF-рендер или парсинг крупного XLSX),
      // PM2 перезапустит его, защищая сервер от OOM-killer.
      max_memory_restart: "1G",
      kill_timeout: 10000,
      listen_timeout: 15000,
      time: true,
      merge_logs: true,
      out_file: "./logs/almafort-out.log",
      error_file: "./logs/almafort-error.log",
      env: {
        NODE_ENV: "production",
        HOST: "127.0.0.1",
        PORT: 3000,
        ...fileEnv,
      },
      env_production: {
        NODE_ENV: "production",
        HOST: fileEnv.HOST || "127.0.0.1",
        PORT: fileEnv.PORT || 3000,
        ...fileEnv,
      },
    },
  ],
};
