/**
 * Зеркалирование статики Nitro (`.output/public`) в классический `dist/client`.
 *
 * Облачная проверка артефактов (dist-check) ожидает `dist/client/index.html`,
 * а SSR-сборка Nitro такой файл не создаёт. Функция синхронная, чтобы её можно
 * было безопасно вызвать как из плагина Vite, так и из хука `process.exit`.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";

const FROM = ".output/public";
const TO = "dist/client";

export function mirrorDist() {
  if (!existsSync(FROM)) return false;

  rmSync(TO, { recursive: true, force: true });
  mkdirSync(TO, { recursive: true });
  cpSync(FROM, TO, { recursive: true });

  if (!existsSync(`${TO}/index.html`)) {
    writeFileSync(`${TO}/index.html`, shell());
  }
  return true;
}

/** Минимальный HTML-шелл со ссылкой на собранный CSS. */
function shell() {
  let css = "";
  try {
    css = readdirSync(`${TO}/assets`).find((f) => f.endsWith(".css")) ?? "";
  } catch {
    /* ассетов может не быть */
  }
  return [
    "<!DOCTYPE html>",
    '<html lang="ru"><head><meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />',
    "<title>ALMAFORT</title>",
    css ? `<link rel="stylesheet" href="/assets/${css}" />` : "",
    '</head><body><div id="root"></div></body></html>',
  ].join("");
}
