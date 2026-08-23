#!/usr/bin/env bash
# ALMAFORT — деплой на VPS (Ubuntu 22.04/24.04, Node 20 LTS, PM2, Nginx).
# Использование:  ./deploy.sh
set -euo pipefail

APP_NAME="almafort"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

log() { printf "\n\033[1;32m==> %s\033[0m\n" "$*"; }
fail() { printf "\n\033[1;31mОШИБКА: %s\033[0m\n" "$*" >&2; exit 1; }

# 1. Проверки окружения ------------------------------------------------------
command -v node >/dev/null || fail "Node.js не установлен (нужен v20 LTS)"
command -v npm  >/dev/null || fail "npm не найден"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 20 ] || fail "Нужен Node.js >= 20 (сейчас v$NODE_MAJOR)"
[ -f .env ] || fail "Нет файла .env — скопируйте .env.example и заполните значения"

# 2. Обязательные переменные -------------------------------------------------
REQUIRED_VARS=(
  VITE_SUPABASE_URL
  VITE_SUPABASE_PUBLISHABLE_KEY
  VITE_SUPABASE_PROJECT_ID
)
set -a; . ./.env; set +a
for v in "${REQUIRED_VARS[@]}"; do
  [ -n "${!v:-}" ] || fail "В .env не задана переменная $v"
done

# 2b. Swap-файл 2 ГБ (страховка от OOM-killer при пиках PDF/XLSX) -------------
SWAP_SIZE_MB=2048
if swapon --show | grep -q "/swapfile"; then
  log "Swap уже включён — пропускаю"
else
  log "Создание swap-файла ${SWAP_SIZE_MB} МБ"
  if [ ! -f /swapfile ]; then
    fallocate -l ${SWAP_SIZE_MB}M /swapfile 2>/dev/null || \
      dd if=/dev/zero of=/swapfile bs=1M count=${SWAP_SIZE_MB} status=progress
    chmod 600 /swapfile
    mkswap /swapfile
  fi
  swapon /swapfile
  # Сохраняем в /etc/fstab, чтобы swap поднимался после перезагрузки
  if ! grep -q "^/swapfile" /etc/fstab; then
    echo "/swapfile none swap sw 0 0" >> /etc/fstab
  fi
  # Снижаем агрессивность swap (10 = предпочитать RAM), чтобы не тормозило
  sysctl -w vm.swappiness=10
  if ! grep -q "vm.swappiness" /etc/sysctl.conf; then
    echo "vm.swappiness=10" >> /etc/sysctl.conf
  fi
  log "Swap активирован (${SWAP_SIZE_MB} МБ), vm.swappiness=10"
fi

# 3. Зависимости -------------------------------------------------------------
log "Установка зависимостей (npm ci)"
if [ -f package-lock.json ]; then
  npm ci
else
  echo "package-lock.json отсутствует — используем npm install (создаст lockfile)"
  npm install
fi

# 4. Сборка под Node-сервер --------------------------------------------------
log "Сборка (Nitro preset: node-server)"
rm -rf .output
DEPLOY_TARGET=vps NITRO_PRESET=node-server NODE_ENV=production npm run build
[ -f .output/server/index.mjs ] || fail "Сборка не создала .output/server/index.mjs"

# 5. Запуск через PM2 --------------------------------------------------------
mkdir -p logs
command -v pm2 >/dev/null || { log "Устанавливаю PM2 глобально"; npm i -g pm2; }

log "Перезапуск PM2-процесса $APP_NAME"
if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  pm2 reload ecosystem.config.cjs --env production --update-env
else
  pm2 start ecosystem.config.cjs --env production
fi
pm2 save

log "Готово. Приложение слушает http://${HOST:-127.0.0.1}:${PORT:-3000}"
echo "Логи:   pm2 logs $APP_NAME"
echo "Статус: pm2 status"
