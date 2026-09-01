/**
 * Обслуживание service worker'а.
 *
 * Кеширование отключено полностью: воркер кешировал HTML-навигации и ломал
 * переходы (`ERR_INVALID_RESPONSE` на /catalog и в Safari, и в Chrome).
 * Здесь мы только вычищаем последствия — снимаем все регистрации и удаляем
 * оставшиеся кеши. Файл `/sw.js` в проде тоже самоудаляющийся.
 */
async function unregisterAllWorkers() {
  if (!("serviceWorker" in navigator)) return;
  const regs = await navigator.serviceWorker.getRegistrations().catch(() => []);
  await Promise.allSettled(regs.map((r) => r.unregister()));
}

async function dropAllCaches() {
  if (typeof caches === "undefined") return;
  const keys = await caches.keys().catch(() => [] as string[]);
  await Promise.allSettled(keys.map((key) => caches.delete(key)));
}

export function registerServiceWorker() {
  if (typeof window === "undefined") return;
  void unregisterAllWorkers();
  void dropAllCaches();
}
