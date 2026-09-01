/**
 * Регистрация service worker'а.
 * Строго запрещена в дев-режиме, внутри iframe и на превью-хостах — иначе
 * браузер начинает отдавать закешированный HTML вместо свежей сборки.
 * Боевой хост задаётся через VITE_PUBLIC_HOST (например, almafort.ru);
 * если переменная не задана, ограничиваемся общими проверками.
 * Аварийный выключатель: любой URL с ?sw=off снимает регистрацию.
 */
const SW_URL = "/sw.js";

function isBlockedContext(): boolean {
  if (typeof window === "undefined") return true;
  if (!import.meta.env.PROD) return true;
  if (window.self !== window.top) return true;
  const host = window.location.hostname;
  if (host.startsWith("id-preview--") || host.startsWith("preview--")) return true;
  const productionHost = (import.meta.env["VITE_PUBLIC_HOST"] as string | undefined)?.trim();
  if (productionHost && host !== productionHost && !host.endsWith(`.${productionHost}`)) return true;
  if (new URLSearchParams(window.location.search).has("sw")) {
    if (new URLSearchParams(window.location.search).get("sw") === "off") return true;
  }
  return false;
}


async function unregisterAppWorkers() {
  if (!("serviceWorker" in navigator)) return;
  const regs = await navigator.serviceWorker.getRegistrations().catch(() => []);
  await Promise.allSettled(
    regs
      .filter((r) => (r.active?.scriptURL ?? r.installing?.scriptURL ?? "").endsWith(SW_URL))
      .map((r) => r.unregister()),
  );
}

export function registerServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  if (isBlockedContext()) {
    void unregisterAppWorkers();
    return;
  }
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register(SW_URL, { scope: "/" }).catch(() => undefined);
  });
}
